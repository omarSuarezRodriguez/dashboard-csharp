import "./loadEnv.js";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { registerRoutes } from "./delivery/routes.js";
import { createLogger } from "./infrastructure/logger.js";
import { getPrisma } from "./infrastructure/prisma.js";
import { PrismaTenantRepository } from "./infrastructure/repositories.js";

const logger = createLogger();

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    logger.fatal("DATABASE_URL is required");
    process.exit(1);
  }
  if (!process.env.ENCRYPTION_KEY) {
    logger.fatal("ENCRYPTION_KEY is required");
    process.exit(1);
  }

  const tenantCount = await new PrismaTenantRepository().count();
  const setupRequired =
    process.env.SETUP_REQUIRED === "true" || tenantCount === 0;

  if (setupRequired) {
    logger.warn(
      "No active tenant or SETUP_REQUIRED=true. Run: npm run setup — then start the server again.",
    );
    if (process.env.SETUP_REQUIRED === "true") {
      process.exit(1);
    }
  }

  const app = Fastify({ logger: false });
  await app.register(formbody);
  await registerRoutes(app, logger);

  const port = parseInt(process.env.PORT ?? "3000", 10);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port, tenantCount }, "Server listening");
}

bootstrap().catch((err) => {
  logger.fatal({ err }, "Failed to start");
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await getPrisma().$disconnect();
  process.exit(0);
});
