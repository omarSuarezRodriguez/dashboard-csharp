import crypto from "node:crypto";
import { decryptSecret } from "../src/infrastructure/encryption.js";
import { getPrisma } from "../src/infrastructure/prisma.js";

const url =
  process.env.WEBHOOK_URL ??
  "https://snowman-shower-pellet.ngrok-free.dev/webhooks/twilio/demo/whatsapp";

const tenant = await getPrisma().tenant.findUnique({ where: { slug: "demo" } });
if (!tenant) throw new Error("tenant demo missing");

const authToken = decryptSecret(tenant.twilioAuthTokenEncrypted, process.env.ENCRYPTION_KEY!);

const testFrom = process.env.TEST_WHATSAPP_TO ?? "whatsapp:+573001111032";
const params: Record<string, string> = {
  From: testFrom.startsWith("whatsapp:") ? testFrom : `whatsapp:${testFrom}`,
  To: tenant.twilioWhatsappTo,
  Body: "hola",
  MessageSid: `SMsim${Date.now()}`,
  NumMedia: "0",
  ProfileName: "Test",
};

let data = url;
for (const key of Object.keys(params).sort()) {
  data += key + params[key];
}
const signature = crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Twilio-Signature": signature,
    "ngrok-skip-browser-warning": "true",
  },
  body: new URLSearchParams(params),
});

console.log(res.status, await res.text());
await getPrisma().$disconnect();
