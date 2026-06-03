import { getPrisma } from "../src/infrastructure/prisma.js";
import { encryptSecret } from "../src/infrastructure/encryption.js";
import { DEFAULT_SETTINGS } from "../src/domain/types.js";

const slug = process.env.TENANT_SLUG ?? "demo";
const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM!;
const webhookBase = process.env.WEBHOOK_BASE_URL ?? "https://snowman-shower-pellet.ngrok-free.dev";
const encryptionKey = process.env.ENCRYPTION_KEY!;
const restaurantName = process.env.RESTAURANT_NAME ?? "La Casa del Sabor";
const timezone = process.env.RESTAURANT_TIMEZONE ?? "America/Bogota";

if (!accountSid || !authToken || !whatsappFrom || !encryptionKey) {
  console.error("Faltan variables TWILIO_* o ENCRYPTION_KEY");
  process.exit(1);
}

const encrypted = encryptSecret(authToken, encryptionKey);
const now = new Date();

await getPrisma().tenant.upsert({
  where: { slug },
  create: {
    slug,
    name: restaurantName,
    language: "es",
    timezone,
    twilioAccountSid: accountSid,
    twilioAuthTokenEncrypted: encrypted,
    twilioWhatsappTo: whatsappFrom,
    webhookBaseUrl: webhookBase.replace(/\/$/, ""),
    settings: DEFAULT_SETTINGS,
    setupCompletedAt: now,
    isActive: true,
  },
  update: {
    name: restaurantName,
    timezone,
    twilioAccountSid: accountSid,
    twilioAuthTokenEncrypted: encrypted,
    twilioWhatsappTo: whatsappFrom,
    webhookBaseUrl: webhookBase.replace(/\/$/, ""),
    settings: DEFAULT_SETTINGS,
    setupCompletedAt: now,
    isActive: true,
  },
});

console.log("OK");
console.log(`${webhookBase.replace(/\/$/, "")}/webhooks/twilio/${slug}/whatsapp`);
await getPrisma().$disconnect();
