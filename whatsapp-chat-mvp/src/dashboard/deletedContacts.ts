import { getPrisma } from "../infrastructure/prisma.js";
import { canonicalWhatsApp, contactKey } from "./phone.js";

const SETTINGS_KEY = "dashboardDeletedPhones";

function sanitizeDeletedKey(key: string): string | null {
  if (key === "_empty") return key;
  if (/^\d{6,20}$/.test(key)) return key;
  if (key.startsWith("_raw:") && key.length <= 64 && !key.includes("whatsapp:+_raw")) {
    return key;
  }
  return null;
}

function readDeletedKeys(settings: unknown): Set<string> {
  const raw = settings && typeof settings === "object" ? settings : {};
  const arr = (raw as Record<string, unknown>)[SETTINGS_KEY];
  if (!Array.isArray(arr)) return new Set();
  const keys = new Set<string>();
  for (const x of arr) {
    if (typeof x !== "string") continue;
    const normalized = x.length === 0 ? "_empty" : x;
    const clean = sanitizeDeletedKey(normalized);
    if (clean) keys.add(clean);
  }
  return keys;
}

export async function getDeletedContactKeys(tenantId: string): Promise<Set<string>> {
  const tenant = await getPrisma().tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  return readDeletedKeys(tenant?.settings);
}

export async function isContactDeleted(tenantId: string, userPhone: string): Promise<boolean> {
  const keys = await getDeletedContactKeys(tenantId);
  return keys.has(contactKey(userPhone));
}

export async function unmarkContactDeleted(tenantId: string, userPhone: string): Promise<void> {
  const key = contactKey(canonicalWhatsApp(userPhone));
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const base =
    tenant?.settings && typeof tenant.settings === "object"
      ? { ...(tenant.settings as Record<string, unknown>) }
      : {};
  const keys = readDeletedKeys(base);
  if (!keys.delete(key)) return;
  base[SETTINGS_KEY] = [...keys];
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: base },
  });
}

export async function markContactDeleted(tenantId: string, userPhone: string): Promise<void> {
  const key = contactKey(canonicalWhatsApp(userPhone));
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const base =
    tenant?.settings && typeof tenant.settings === "object"
      ? { ...(tenant.settings as Record<string, unknown>) }
      : {};
  const keys = readDeletedKeys(base);
  keys.add(key);
  base[SETTINGS_KEY] = [...keys].flatMap((k) => {
    const clean = sanitizeDeletedKey(k);
    return clean ? [clean] : [];
  });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: base },
  });
}

function matchesContact(
  userPhone: string,
  key: string,
  canonical: string,
  requestRaw: string,
): boolean {
  if (contactKey(userPhone) === key) return true;
  const stored = (userPhone ?? "").trim().toLowerCase();
  const req = requestRaw.trim().toLowerCase();
  const canon = canonical.trim().toLowerCase();
  return stored === req || stored === canon;
}

export async function purgeContactFromDatabase(
  tenantId: string,
  userPhone: string,
): Promise<{ messagesDeleted: number; conversationsDeleted: number }> {
  const canonical = canonicalWhatsApp(userPhone);
  const key = contactKey(canonical);
  const requestRaw = (userPhone ?? "").trim();
  const prisma = getPrisma();

  const [conversations, messages] = await Promise.all([
    prisma.conversation.findMany({
      where: { tenantId },
      select: { userPhone: true },
    }),
    prisma.message.findMany({
      where: { tenantId },
      select: { id: true, userPhone: true },
    }),
  ]);

  const convPhones = conversations
    .filter((c) => matchesContact(c.userPhone, key, canonical, requestRaw))
    .map((c) => c.userPhone);
  const messageIds = messages
    .filter((m) => matchesContact(m.userPhone, key, canonical, requestRaw))
    .map((m) => m.id);

  await prisma.$transaction([
    prisma.message.deleteMany({ where: { id: { in: messageIds } } }),
    ...convPhones.map((phone) =>
      prisma.conversation.delete({
        where: { tenantId_userPhone: { tenantId, userPhone: phone } },
      }),
    ),
  ]);

  await markContactDeleted(tenantId, userPhone);

  return {
    messagesDeleted: messageIds.length,
    conversationsDeleted: convPhones.length,
  };
}
