import { getPrisma } from "../infrastructure/prisma.js";
import { encryptSecret } from "../infrastructure/encryption.js";
import { DEFAULT_SETTINGS } from "../domain/types.js";
import { ask, askHidden, createPrompter, requirePlatformEnv } from "./prompts.js";

async function main() {
  requirePlatformEnv();
  const args = process.argv.slice(2);
  const reconfigureArg = args.find((a) => a.startsWith("--reconfigure="));
  const reconfigureSlug = reconfigureArg?.split("=")[1];

  const rl = await createPrompter();
  try {
    console.log("\n=== WhatsApp Chat MVP — Setup ===\n");

    const slug = reconfigureSlug ?? (await ask(rl, "Slug del restaurante (URL)", "mi-restaurante"));
    const existing = await getPrisma().tenant.findUnique({ where: { slug } });

    if (existing && !reconfigureSlug) {
      const overwrite = await ask(rl, `El slug "${slug}" ya existe. ¿Reconfigurar? (s/n)`, "n");
      if (overwrite.toLowerCase() !== "s" && overwrite.toLowerCase() !== "si") {
        console.log("Cancelado.");
        return;
      }
    }

    const name = await ask(rl, "Nombre del restaurante");
    const language = await ask(rl, "Idioma (es|en)", "es");
    const timezone = await ask(rl, "Zona horaria IANA", "America/Mexico_City");

    const twilioAccountSid = await ask(rl, "Twilio Account SID");
    const twilioAuthToken = await askHidden(rl, "Twilio Auth Token");
    const twilioWhatsappTo = await ask(rl, "Número WhatsApp Twilio (E.164)", "whatsapp:+14155238886");
    const webhookBaseUrl = await ask(rl, "URL pública base (sin path final)", "https://example.com");
    const webhookFinal = `${webhookBaseUrl.replace(/\/$/, "")}/webhooks/twilio/${slug}/whatsapp`;
    console.log(`\nWebhook a configurar en Twilio:\n  ${webhookFinal}\n`);

    const businessHours = await ask(rl, "Horario", DEFAULT_SETTINGS.business_hours);
    const menu = await ask(rl, "Menú (multilínea; Enter vacío = plantilla)", "");
    const welcome = await ask(rl, "Bienvenida ({{name}} opcional)", DEFAULT_SETTINGS.welcome_message);
    const reserva = await ask(rl, "¿Reservas habilitadas? (s/n)", "s");
    const capacityStr = await ask(rl, "Capacidad por reserva", String(DEFAULT_SETTINGS.reservation_capacity));
    const helpText = await ask(rl, "Texto de ayuda", DEFAULT_SETTINGS.help_text);

    const settings = {
      menu: menu || DEFAULT_SETTINGS.menu,
      welcome_message: welcome,
      business_hours: businessHours,
      reservation_enabled: reserva.toLowerCase().startsWith("s"),
      reservation_capacity: parseInt(capacityStr, 10) || 4,
      help_text: helpText,
    };

    const encrypted = encryptSecret(twilioAuthToken, process.env.ENCRYPTION_KEY!);
    const now = new Date();

    if (existing) {
      await getPrisma().tenant.update({
        where: { slug },
        data: {
          name,
          language,
          timezone,
          twilioAccountSid,
          twilioAuthTokenEncrypted: encrypted,
          twilioWhatsappTo,
          webhookBaseUrl: webhookBaseUrl.replace(/\/$/, ""),
          settings,
          setupCompletedAt: now,
          isActive: true,
        },
      });
    } else {
      await getPrisma().tenant.create({
        data: {
          slug,
          name,
          language,
          timezone,
          twilioAccountSid,
          twilioAuthTokenEncrypted: encrypted,
          twilioWhatsappTo,
          webhookBaseUrl: webhookBaseUrl.replace(/\/$/, ""),
          settings,
          setupCompletedAt: now,
          isActive: true,
        },
      });
    }

    console.log("\n✓ Tenant guardado y activo.");
    const test = await ask(rl, "¿Enviar mensaje de prueba vía API? (s/n)", "n");
    if (test.toLowerCase() === "s" || test.toLowerCase() === "si") {
      const to = await ask(rl, "Tu WhatsApp (E.164)", "whatsapp:+521234567890");
      const twilio = await import("twilio");
      const client = twilio.default(twilioAccountSid, twilioAuthToken);
      await client.messages.create({
        from: twilioWhatsappTo,
        to,
        body: `[${name}] Setup OK. Webhook: ${webhookFinal}`,
      });
      console.log("Mensaje de prueba enviado.");
    } else {
      console.log("\nConfigura el webhook en Twilio Console con la URL anterior.");
    }
  } finally {
    rl.close();
    await getPrisma().$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
