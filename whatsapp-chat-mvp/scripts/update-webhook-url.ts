import { getPrisma } from "../src/infrastructure/prisma.js";

const baseUrl = process.argv[2]?.replace(/\/$/, "");
const slug = process.argv[3] ?? "demo";

if (!baseUrl) {
  console.error("Uso: npx tsx scripts/update-webhook-url.ts <WEBHOOK_BASE_URL> [slug]");
  process.exit(1);
}

await getPrisma().tenant.update({
  where: { slug },
  data: { webhookBaseUrl: baseUrl },
});

console.log(`Webhook base actualizado para "${slug}"`);
console.log(`POST ${baseUrl}/webhooks/twilio/${slug}/whatsapp`);
await getPrisma().$disconnect();
