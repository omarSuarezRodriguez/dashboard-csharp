function phoneDigits(addr: string): string {
  return (addr ?? "").replace(/\D/g, "");
}

/** Desenreda direcciones corruptas (p. ej. whatsapp:+_raw:whatsapp:+_raw:x). */
export function unwrapCorruptAddr(addr: string): string {
  let s = (addr ?? "").trim();
  for (let i = 0; i < 12; i++) {
    const lower = s.toLowerCase();
    if (lower.startsWith("whatsapp:+_raw:")) {
      s = s.slice("whatsapp:+_raw:".length).trim();
      continue;
    }
    const idx = lower.lastIndexOf("_raw:");
    if (idx >= 0) {
      s = s.slice(idx + 5).trim();
      continue;
    }
    break;
  }
  return s;
}

export function isCorruptPhone(addr: string): boolean {
  const lower = (addr ?? "").toLowerCase();
  return lower.includes("whatsapp:+_raw") || lower.split("_raw:").length > 2;
}

/** Clave estable para agrupar el mismo contacto (incluye números inválidos como "x"). */
export function contactKey(addr: string): string {
  const s = unwrapCorruptAddr(addr).toLowerCase();
  const digits = phoneDigits(s);
  if (digits.length > 0) return digits;
  if (!s) return "_empty";
  return `_raw:${s}`;
}

/** Formato único: whatsapp:+E164 (evita chats duplicados) */
export function canonicalWhatsApp(addr: string): string {
  const s = unwrapCorruptAddr(addr);
  const digits = phoneDigits(s);
  if (!digits) return s;
  return `whatsapp:+${digits}`;
}

export function ensureWhatsApp(addr: string): string {
  return canonicalWhatsApp(addr);
}

export function displayPhone(addr: string): string {
  const digits = phoneDigits(addr);
  if (digits.length <= 4) return addr || "Desconocido";
  return `+${digits}`;
}

export function resolveDisplayName(
  customName: string | null | undefined,
  userPhone: string,
): string {
  const trimmed = customName?.trim();
  if (trimmed) return trimmed;
  return displayPhone(userPhone);
}
