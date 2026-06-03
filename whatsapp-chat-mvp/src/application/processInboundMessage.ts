import type {
  ConversationRepository,
  InboundInput,
  IntentClassifier,
  MessageRepository,
  ProcessResult,
} from "./ports.js";
import { RuleBasedClassifier } from "./classifier.js";
import { dispatchHandler } from "./handlers/index.js";
import { normalizeForClassification, truncateReply } from "../domain/text.js";
import { canonicalWhatsApp } from "../dashboard/phone.js";

export class ProcessInboundMessage {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly classifier: IntentClassifier = new RuleBasedClassifier(),
  ) {}

  async execute(input: InboundInput): Promise<ProcessResult> {
    const userPhone = canonicalWhatsApp(input.from);
    const bodyOriginal = input.body ?? "";
    const bodyNormalized = normalizeForClassification(bodyOriginal);
    const stepBefore = (await this.conversations.findOrCreate(
      input.tenant.id,
      userPhone,
    )).step;

    let conversation = await this.conversations.findOrCreate(
      input.tenant.id,
      userPhone,
    );

    if (input.numMedia > 0 && !expectsMedia(conversation.step)) {
      const replyText = truncateReply(
        "Por ahora solo aceptamos mensajes de texto. Escribe tu consulta.",
      );
      await this.persist(
        input,
        userPhone,
        bodyOriginal,
        replyText,
        "unknown",
        stepBefore,
        conversation.step,
      );
      return { replyText, intent: "unknown", stepBefore, stepAfter: conversation.step };
    }

    const intent = this.classifier.classify({
      bodyNormalized,
      step: conversation.step,
      language: input.tenant.language,
    });

    const { replyText: rawReply, conversation: updated } = dispatchHandler(intent, {
      tenant: input.tenant,
      conversation,
      bodyOriginal,
      bodyNormalized,
      profileName: input.profileName,
    });

    const replyText = truncateReply(rawReply);
    await this.conversations.save(updated);

    await this.persist(
      input,
      userPhone,
      bodyOriginal,
      replyText,
      intent,
      stepBefore,
      updated.step,
    );

    return {
      replyText,
      intent,
      stepBefore,
      stepAfter: updated.step,
    };
  }

  private async persist(
    input: InboundInput,
    userPhone: string,
    bodyOriginal: string,
    replyText: string,
    intent: string,
    stepBefore: string,
    stepAfter: string,
  ): Promise<void> {
    const inboundAt = new Date();
    await this.messages.saveInbound({
      tenantId: input.tenant.id,
      userPhone,
      body: bodyOriginal,
      messageSid: input.messageSid,
      intent,
      stepBefore,
      stepAfter,
      createdAt: inboundAt,
    });
    const outboundAt = new Date(Math.max(Date.now(), inboundAt.getTime() + 1));
    await this.messages.saveOutbound({
      tenantId: input.tenant.id,
      userPhone,
      body: replyText,
      intent,
      stepBefore,
      stepAfter,
      createdAt: outboundAt,
    });
  }
}

function expectsMedia(_step: string): boolean {
  return false;
}
