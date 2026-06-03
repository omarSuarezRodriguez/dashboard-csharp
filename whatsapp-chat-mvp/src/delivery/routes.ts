import type { FastifyInstance } from "fastify";
import { ProcessInboundMessage } from "../application/processInboundMessage.js";
import type { AppLogger } from "../infrastructure/logger.js";
import {
  PrismaConversationRepository,
  PrismaMessageRepository,
  PrismaTenantRepository,
} from "../infrastructure/repositories.js";
import { getPrisma } from "../infrastructure/prisma.js";
import { twimlEmpty, twimlMessage } from "./twiml.js";
import { validateTwilioSignature } from "./twilioSignature.js";

const NOT_CONFIGURED =
  "Este canal aún no está activo. Contacta al administrador.";
const SERVICE_ERROR =
  "Hubo un problema, intenta en un momento.";

export async function registerRoutes(app: FastifyInstance, logger: AppLogger) {
  const tenants = new PrismaTenantRepository();
  const messages = new PrismaMessageRepository();
  const conversations = new PrismaConversationRepository();
  const processor = new ProcessInboundMessage(conversations, messages);

  app.get("/health", async () => {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      return { status: "ok", db: "ok" };
    } catch {
      return { status: "ok", db: "error" };
    }
  });

  app.post("/webhooks/twilio/:tenantSlug/whatsapp", async (request, reply) => {
    const start = Date.now();
    const { tenantSlug } = request.params as { tenantSlug: string };
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      logger.error("ENCRYPTION_KEY missing");
      return reply.type("text/xml").send(twimlMessage(SERVICE_ERROR));
    }

    const tenant = await tenants.findBySlug(tenantSlug);
    if (!tenant || !tenant.setupCompletedAt || !tenant.isActive) {
      return reply.type("text/xml").status(200).send(twimlMessage(NOT_CONFIGURED));
    }

    const body = (request.body ?? {}) as Record<string, string>;
    const signature = request.headers["x-twilio-signature"] as string | undefined;
    const webhookUrl = `${tenant.webhookBaseUrl.replace(/\/$/, "")}/webhooks/twilio/${tenantSlug}/whatsapp`;

    const valid = validateTwilioSignature(
      tenant.twilioAuthTokenEncrypted,
      encryptionKey,
      signature,
      webhookUrl,
      body,
    );
    if (!valid) {
      logger.warn({ tenant_id: tenant.id, tenantSlug }, "Invalid Twilio signature");
      return reply.status(403).send("Forbidden");
    }

    const messageSid = body.MessageSid ?? body.SmsMessageSid ?? "";
    if (messageSid && (await messages.existsByTwilioSid(messageSid))) {
      logger.info({ tenant_id: tenant.id, MessageSid: messageSid }, "Duplicate webhook");
      return reply.type("text/xml").status(200).send(twimlEmpty());
    }

    try {
      const result = await processor.execute({
        tenant,
        from: body.From ?? "",
        to: body.To ?? "",
        body: body.Body ?? "",
        messageSid,
        profileName: body.ProfileName,
        numMedia: parseInt(body.NumMedia ?? "0", 10) || 0,
      });

      logger.info(
        {
          tenant_id: tenant.id,
          MessageSid: messageSid,
          intent: result.intent,
          step: result.stepAfter,
          latency_ms: Date.now() - start,
        },
        "Inbound processed",
      );

      return reply.type("text/xml").status(200).send(twimlMessage(result.replyText));
    } catch (err) {
      logger.error(
        { tenant_id: tenant.id, MessageSid: messageSid, err },
        "Webhook handler error",
      );
      return reply.type("text/xml").status(200).send(twimlMessage(SERVICE_ERROR));
    }
  });
}
