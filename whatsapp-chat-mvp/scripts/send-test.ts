import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const to = process.env.TEST_WHATSAPP_TO!.startsWith("whatsapp:")
  ? process.env.TEST_WHATSAPP_TO!
  : `whatsapp:${process.env.TEST_WHATSAPP_TO!}`;

await client.messages.create({
  from: process.env.TWILIO_WHATSAPP_FROM!,
  to,
  body: "Bot activo. Escribe *hola* o *menú* para probar.",
});
console.log("Mensaje enviado a", to);
