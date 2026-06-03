/**
 * Configura tenant, webhook en Twilio y verifica el stack local.
 * Requiere: servidor en PORT (default 5001), ngrok apuntando al proxy Flask o a este puerto.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, "..");

function run(script: string, extraEnv: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsx", "--env-file=.env", script],
      {
        cwd: projectRoot,
        env: { ...process.env, ...extraEnv },
        stdio: "inherit",
        shell: true,
      },
    );
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))));
  });
}

const base = process.env.WEBHOOK_BASE_URL?.replace(/\/$/, "");
const slug = process.env.TENANT_SLUG ?? "demo";

if (!base) {
  console.error("Define WEBHOOK_BASE_URL en .env (URL pública sin path, ej. https://xxx.ngrok-free.dev)");
  process.exit(1);
}

const webhookUrl = `${base}/webhooks/twilio/${slug}/whatsapp`;

console.log("\n=== WhatsApp Chat MVP — Go Live ===\n");
console.log("1/3 Configurando tenant en base de datos...");
await run("scripts/configure-tenant.ts");

console.log("\n2/3 Registrando webhook en Twilio...");
await run("scripts/set-whatsapp-webhook.ts", { WEBHOOK_URL: webhookUrl });

console.log("\n3/3 Simulando mensaje entrante (firma Twilio)...");
await run("scripts/simulate-inbound.ts", { WEBHOOK_URL: webhookUrl });

console.log("\n✓ Listo. Webhook activo:");
console.log(`   ${webhookUrl}`);
console.log("\nEscribe *hola* o *menú* al número de WhatsApp del bot.");
