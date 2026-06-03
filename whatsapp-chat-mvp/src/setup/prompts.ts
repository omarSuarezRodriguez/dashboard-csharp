import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function createPrompter() {
  return readline.createInterface({ input, output });
}

export async function ask(rl: readline.Interface, label: string, def?: string): Promise<string> {
  const hint = def ? ` [${def}]` : "";
  const answer = (await rl.question(`${label}${hint}: `)).trim();
  return answer || def || "";
}

export async function askHidden(rl: readline.Interface, label: string): Promise<string> {
  process.stdout.write(`${label}: `);
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  if (!stdin.isTTY) {
    return (await rl.question("")).trim();
  }
  stdin.setRawMode?.(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      const c = chunk.toString("utf8");
      if (c === "\n" || c === "\r" || c === "\u0004") {
        stdin.setRawMode?.(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value.trim());
        return;
      }
      if (c === "\u0003") process.exit(130);
      if (c === "\u007f" || c === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += c;
    };
    stdin.on("data", onData);
  });
}

export function requirePlatformEnv(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env and configure it.");
  }
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY is required (32+ chars or 64 hex chars).");
  }
}
