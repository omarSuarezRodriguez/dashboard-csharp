import type { FastifyInstance } from "fastify";
import twilio from "twilio";
import type { AppLogger } from "../infrastructure/logger.js";
import { getPrisma } from "../infrastructure/prisma.js";
import { buildConversationList } from "./conversationList.js";
import { normalizeTenantPhones } from "./normalizePhones.js";
import { purgeContactFromDatabase, unmarkContactDeleted } from "./deletedContacts.js";
import { canonicalWhatsApp, ensureWhatsApp, resolveDisplayName } from "./phone.js";
import type { TwilioMessageSync } from "./twilioSync.js";

export interface DashboardContext {
  tenantId: string;
  tenantName: string;
  fromNumber: string;
  accountSid: string;
  authToken: string;
  sync?: TwilioMessageSync;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  ctx: DashboardContext,
  logger: AppLogger,
) {
  app.get("/api/health", async () => ({
    status: "ok",
    service: "whatsapp-dashboard",
    restaurant: ctx.tenantName,
    sync: ctx.sync?.getStats() ?? null,
  }));

  app.post("/api/sync", async (_req, reply) => {
    if (!ctx.sync) {
      return reply.status(503).send({ error: "Sync no disponible" });
    }
    const days = parseInt(process.env.SYNC_HISTORY_DAYS ?? "90", 10);
    void ctx.sync.syncFull(days);
    return { ok: true, message: "Sincronización completa en segundo plano" };
  });

  app.post("/api/normalize", async () => {
    const result = await normalizeTenantPhones(ctx.tenantId, logger);
    return { ok: true, ...result };
  });

  app.get("/api/conversations", async () => {
    const conversations = await buildConversationList(ctx.tenantId);
    return { conversations, totalChats: conversations.length };
  });

  app.post<{ Body: { phone?: string; displayName?: string } }>(
    "/api/conversations",
    async (request, reply) => {
      const raw = (request.body?.phone ?? "").trim();
      if (!raw) {
        return reply.status(400).send({ error: "Indica el número de WhatsApp" });
      }

      const userPhone = canonicalWhatsApp(raw);
      const digits = userPhone.replace(/\D/g, "");
      if (digits.length < 8) {
        return reply.status(400).send({ error: "Número inválido" });
      }

      const displayName = request.body?.displayName?.trim() || null;

      await unmarkContactDeleted(ctx.tenantId, userPhone);

      await getPrisma().conversation.upsert({
        where: {
          tenantId_userPhone: { tenantId: ctx.tenantId, userPhone },
        },
        create: {
          tenantId: ctx.tenantId,
          userPhone,
          displayName,
          step: "idle",
          context: {},
        },
        update: {
          displayName: displayName ?? undefined,
          updatedAt: new Date(),
        },
      });

      return {
        ok: true,
        userPhone,
        displayName: resolveDisplayName(displayName, userPhone),
      };
    },
  );

  app.patch<{
    Params: { phone: string };
    Body: { displayName?: string };
  }>("/api/conversations/:phone", async (request, reply) => {
    const userPhone = canonicalWhatsApp(decodeURIComponent(request.params.phone));
    const displayName = request.body?.displayName?.trim();
    if (!displayName) {
      return reply.status(400).send({ error: "El nombre no puede estar vacío" });
    }

    await getPrisma().conversation.upsert({
      where: {
        tenantId_userPhone: { tenantId: ctx.tenantId, userPhone },
      },
      create: {
        tenantId: ctx.tenantId,
        userPhone,
        displayName,
        step: "idle",
        context: {},
      },
      update: { displayName },
    });

    return {
      ok: true,
      userPhone,
      displayName,
    };
  });

  app.delete<{ Params: { phone: string } }>(
    "/api/conversations/:phone",
    async (request) => {
      const userPhone = canonicalWhatsApp(decodeURIComponent(request.params.phone));
      const result = await purgeContactFromDatabase(ctx.tenantId, userPhone);
      logger.info({ userPhone, ...result }, "Chat eliminado del panel");
      return {
        ok: true,
        userPhone,
        ...result,
      };
    },
  );

  app.get<{ Params: { phone: string } }>(
    "/api/conversations/:phone/messages",
    async (request) => {
      const userPhone = canonicalWhatsApp(decodeURIComponent(request.params.phone));
      const conv = await getPrisma().conversation.findUnique({
        where: {
          tenantId_userPhone: { tenantId: ctx.tenantId, userPhone },
        },
      });

      const messages = await getPrisma().message.findMany({
        where: { tenantId: ctx.tenantId, userPhone },
        orderBy: { createdAt: "asc" },
      });

      return {
        userPhone,
        displayName: resolveDisplayName(conv?.displayName, userPhone),
        total: messages.length,
        messages: messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
  );

  app.post<{ Params: { phone: string }; Body: { body?: string } }>(
    "/api/conversations/:phone/send",
    async (request, reply) => {
      const userPhone = canonicalWhatsApp(decodeURIComponent(request.params.phone));
      const text = (request.body?.body ?? "").trim();
      if (!text) {
        return reply.status(400).send({ error: "El mensaje no puede estar vacío" });
      }

      const to = ensureWhatsApp(userPhone);
      const client = twilio(ctx.accountSid, ctx.authToken);

      try {
        const sent = await client.messages.create({
          from: ctx.fromNumber,
          to,
          body: text,
        });

        await getPrisma().conversation.upsert({
          where: {
            tenantId_userPhone: { tenantId: ctx.tenantId, userPhone: to },
          },
          create: { tenantId: ctx.tenantId, userPhone: to, step: "idle", context: {} },
          update: { updatedAt: new Date() },
        });

        await getPrisma().message.create({
          data: {
            tenantId: ctx.tenantId,
            userPhone: to,
            direction: "outbound",
            body: text,
            twilioMessageSid: sent.sid ?? undefined,
          },
        });

        return {
          ok: true,
          sid: sent.sid,
          status: sent.status,
        };
      } catch (err) {
        logger.error({ err, to }, "Error enviando mensaje");
        const message =
          err instanceof Error ? err.message : "No se pudo enviar el mensaje";
        return reply.status(502).send({ error: message });
      }
    },
  );
}
