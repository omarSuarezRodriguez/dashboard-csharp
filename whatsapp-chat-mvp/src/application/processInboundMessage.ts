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

export class ProcessInboundMessage {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly classifier: IntentClassifier = new RuleBasedClassifier(),
  ) {}

  async execute(input: InboundInput): Promise<ProcessResult> {
    const bodyOriginal = input.body ?? "";
    const bodyNormalized = normalizeForClassification(bodyOriginal);
    const stepBefore = (await this.conversations.findOrCreate(
      input.tenant.id,
      input.from,
    )).step;

    let conversation = await this.conversations.findOrCreate(
      input.tenant.id,
      input.from,
    );

    if (input.numMedia > 0 && !expectsMedia(conversation.step)) {
      const replyText = truncateReply(
        "Por ahora solo aceptamos mensajes de texto. Escribe tu consulta.",
      );
      await this.persist(input, bodyOriginal, replyText, "unknown", stepBefore, conversation.step);
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
    bodyOriginal: string,
    replyText: string,
    intent: string,
    stepBefore: string,
    stepAfter: string,
  ): Promise<void> {
    await this.messages.saveInbound({
      tenantId: input.tenant.id,
      userPhone: input.from,
      body: bodyOriginal,
      messageSid: input.messageSid,
      intent,
      stepBefore,
      stepAfter,
    });
    await this.messages.saveOutbound({
      tenantId: input.tenant.id,
      userPhone: input.from,
      body: replyText,
      intent,
      stepBefore,
      stepAfter,
    });
  }
}

function expectsMedia(_step: string): boolean {
  return false;
}
