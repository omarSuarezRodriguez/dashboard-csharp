const sid = process.env.TWILIO_ACCOUNT_SID!;
const token = process.env.TWILIO_AUTH_TOKEN!;
const webhookUrl = process.env.WEBHOOK_URL!;
const auth = Buffer.from(`${sid}:${token}`).toString("base64");

const res = await fetch("https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=20", {
  headers: { Authorization: `Basic ${auth}` },
});
const data = (await res.json()) as { senders?: Array<{ sid: string; sender_id: string; profile?: { webhook?: { callback_url?: string } } }> };

if (!res.ok || !data.senders?.length) {
  console.error("Senders API:", res.status, JSON.stringify(data));
  process.exit(1);
}

for (const s of data.senders) {
  console.log("Sender:", s.sender_id, s.sid);
}

const fromDigits = (process.env.TWILIO_WHATSAPP_FROM ?? "").replace(/\D/g, "");
const target =
  data.senders.find((s) => s.sender_id && fromDigits && s.sender_id.replace(/\D/g, "").includes(fromDigits)) ??
  data.senders.find((s) => s.sender_id?.includes("573242497352")) ??
  data.senders[0];

const patch = await fetch(`https://messaging.twilio.com/v2/Channels/Senders/${target.sid}`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    webhook: {
      callback_url: webhookUrl,
      callback_method: "POST",
    },
  }),
});

const patched = await patch.json();
if (!patch.ok) {
  console.error("Patch failed:", patch.status, patched);
  process.exit(1);
}
console.log("WhatsApp webhook OK:", target.sender_id);
