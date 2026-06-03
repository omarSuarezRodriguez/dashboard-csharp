import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const webhookUrl = process.env.WEBHOOK_URL!;
const from = process.env.TWILIO_WHATSAPP_FROM!.replace("whatsapp:", "");

const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: from, limit: 20 });
if (numbers.length === 0) {
  const all = await client.incomingPhoneNumbers.list({ limit: 50 });
  const match = all.find((n) => n.phoneNumber?.includes(from.replace("+", "")) || from.includes(n.phoneNumber ?? ""));
  if (!match) {
    console.error("No se encontró el número en IncomingPhoneNumbers. Configura el webhook manual en Console:");
    console.error(webhookUrl);
    process.exit(1);
  }
  await client.incomingPhoneNumbers(match.sid).update({
    smsUrl: webhookUrl,
    smsMethod: "POST",
  });
  console.log("Webhook actualizado en", match.phoneNumber);
} else {
  await client.incomingPhoneNumbers(numbers[0].sid).update({
    smsUrl: webhookUrl,
    smsMethod: "POST",
  });
  console.log("Webhook actualizado en", numbers[0].phoneNumber);
}
