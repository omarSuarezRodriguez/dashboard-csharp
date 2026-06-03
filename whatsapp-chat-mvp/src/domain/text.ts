const YES = new Set(["si", "sí", "yes", "y", "confirmo", "confirmar", "ok"]);
const NO = new Set(["no", "n", "cancelar", "cancela"]);

export function normalizeForClassification(body: string): string {
  return body.trim().toLowerCase();
}

export function isAffirmative(text: string): boolean {
  return YES.has(normalizeForClassification(text));
}

export function isNegative(text: string): boolean {
  return NO.has(normalizeForClassification(text));
}

export function applyNameTemplate(template: string, name?: string): string {
  const display = name?.trim() || "amigo";
  return template.replace(/\{\{name\}\}/gi, display);
}

export function truncateReply(text: string, max = 1600): string {
  if (text.length <= max) return text;
  const suffix = "\n\n(mensaje recortado)";
  return text.slice(0, max - suffix.length) + suffix;
}

export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isSameCalendarDay(a: Date | null, dayStr: string, timezone: string): boolean {
  if (!a) return false;
  const aStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(a);
  return aStr === dayStr;
}
