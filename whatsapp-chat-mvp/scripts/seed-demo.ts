import { getPrisma } from "../src/infrastructure/prisma.js";
import { encryptSecret } from "../src/infrastructure/encryption.js";
import { DEFAULT_SETTINGS } from "../src/domain/types.js";

const slug = "demo";

async function main() {
  const key = process.env.ENCRYPTION_KEY!;
  const encrypted = encryptSecret("demo-auth-token-not-real", key);
  const now = new Date();

  await getPrisma().tenant.upsert({
    where: { slug },
    create: {
      slug,
      name: "Restaurante Demo",
      language: "es",
      timezone: "America/Mexico_City",
      twilioAccountSid: "AC00000000000000000000000000000000",
      twilioAuthTokenEncrypted: encrypted,
      twilioWhatsappTo: "whatsapp:+14155238886",
      webhookBaseUrl: "http://localhost:3000",
      settings: DEFAULT_SETTINGS,
      setupCompletedAt: now,
      isActive: true,
    },
    update: {
      setupCompletedAt: now,
      isActive: true,
      settings: DEFAULT_SETTINGS,
    },
  });

  console.log("Tenant demo listo.");
  console.log("Webhook: http://localhost:3000/webhooks/twilio/demo/whatsapp");
}

main()
  .finally(() => getPrisma().$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
