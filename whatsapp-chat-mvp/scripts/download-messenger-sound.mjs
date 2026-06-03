import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "dashboard", "sounds");

const files = [
  {
    name: "messenger.mp3",
    url: "https://static.xx.fbcdn.net/rsrc.php/yq/r/OC4-KYxmKsR.mp3",
  },
  {
    name: "messenger.ogg",
    url: "https://static.xx.fbcdn.net/rsrc.php/yy/r/XFhtdTsftOC.ogg",
  },
];

mkdirSync(outDir, { recursive: true });

for (const { name, url } of files) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Error ${res.status} al descargar ${name}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const outFile = join(outDir, name);
  writeFileSync(outFile, buf);
  console.log("Wrote", outFile, `(${buf.length} bytes)`);
}
