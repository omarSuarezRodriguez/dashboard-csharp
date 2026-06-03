import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const soundPath = join(__dirname, "..", "public", "dashboard", "sounds", "whatsapp-web.mp3");

if (!existsSync(soundPath)) {
  console.error("FALTA:", soundPath);
  process.exit(1);
}

const buf = readFileSync(soundPath);
const head = buf.subarray(0, 3).toString("ascii");
if (head !== "ID3" && !(buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
  console.error("El archivo no parece MP3 válido");
  process.exit(1);
}

console.log("OK whatsapp-web.mp3", buf.length, "bytes");
