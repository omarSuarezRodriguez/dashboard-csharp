import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "dashboard", "sounds");
const outFile = join(outDir, "whatsapp-web.mp3");
const url = "https://www.myinstants.com/media/sounds/web_whatsapp.mp3";

mkdirSync(outDir, { recursive: true });

const res = await fetch(url);
if (!res.ok) {
  console.error("No se pudo descargar:", res.status);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(outFile, buf);
console.log("Wrote", outFile, `(${buf.length} bytes)`);
console.log("Fuente: https://www.myinstants.com/en/instant/whatsapp-web-notification-59439/");
console.log("O copia: C:\\Users\\Usuario\\Downloads\\web_whatsapp.mp3");
