import "./loadEnv.js";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerDashboardRoutes } from "./dashboard/routes.js";
import { normalizeTenantPhones } from "./dashboard/normalizePhones.js";
import { purgeCorruptContacts } from "./dashboard/purgeCorrupt.js";
import { TwilioMessageSync } from "./dashboard/twilioSync.js";
import { createLogger } from "./infrastructure/logger.js";
import { getPrisma } from "./infrastructure/prisma.js";
import { parseTenantSettings } from "./domain/types.js";
import { PrismaTenantRepository } from "./infrastructure/repositories.js";

const logger = createLogger();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM?.trim();

  if (!accountSid || !authToken || !fromNumber) {
    logger.fatal("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM son obligatorios");
    process.exit(1);
  }

  const slug = process.env.TENANT_SLUG ?? "demo";
  let tenant = await new PrismaTenantRepository().findBySlug(slug);
  if (!tenant) {
    logger.warn({ slug }, "Tenant no encontrado; ejecuta: npm run configure");
    const count = await getPrisma().tenant.count();
    if (count === 0) {
      logger.fatal("Sin tenant en base de datos. Ejecuta: npm run configure");
      process.exit(1);
    }
    const first = await getPrisma().tenant.findFirst({ orderBy: { createdAt: "asc" } });
    if (!first) process.exit(1);
    tenant = {
      id: first.id,
      slug: first.slug,
      name: first.name,
      language: first.language,
      timezone: first.timezone,
      twilioAccountSid: first.twilioAccountSid,
      twilioAuthTokenEncrypted: first.twilioAuthTokenEncrypted,
      twilioWhatsappTo: first.twilioWhatsappTo,
      webhookBaseUrl: first.webhookBaseUrl,
      settings: parseTenantSettings(first.settings),
      setupCompletedAt: first.setupCompletedAt,
      isActive: first.isActive,
    };
  }

  const app = Fastify({ logger: false });

  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error, url: request.url }, "Dashboard API error");
    const message =
      error instanceof Error ? error.message : "Error interno del servidor";
    return reply.status(500).send({ error: message });
  });

  const syncMs = Math.max(500, parseInt(process.env.SYNC_INTERVAL_MS ?? "1000", 10));

  const sync = new TwilioMessageSync(
    tenant.id,
    fromNumber,
    accountSid,
    authToken,
    logger,
    syncMs,
  );

  await registerDashboardRoutes(
    app,
    {
      tenantId: tenant.id,
      tenantName: tenant.name,
      fromNumber: fromNumber.startsWith("whatsapp:")
        ? fromNumber
        : `whatsapp:${fromNumber}`,
      accountSid,
      authToken,
      sync,
    },
    logger,
  );

  const publicDir = path.join(__dirname, "..", "public", "dashboard");
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api")) {
      return reply.status(404).send({ error: "No encontrado" });
    }
    return reply.sendFile("index.html");
  });

  const port = parseInt(process.env.DASHBOARD_PORT ?? process.env.PORT ?? "5002", 10);

  await purgeCorruptContacts(tenant.id, logger);
  await normalizeTenantPhones(tenant.id, logger);
  sync.start();

  await app.listen({ port, host: "0.0.0.0" });
  logger.info(
    { port, url: `http://localhost:${port}`, tenant: tenant.slug },
    "Dashboard WhatsApp listo (sin bot automático)",
  );
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "Dashboard no arrancó");
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await getPrisma().$disconnect();
  process.exit(0);
});
