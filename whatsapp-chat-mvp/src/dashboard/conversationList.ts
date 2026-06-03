import { getPrisma } from "../infrastructure/prisma.js";
import { getDeletedContactKeys } from "./deletedContacts.js";
import { canonicalWhatsApp, contactKey, isCorruptPhone, resolveDisplayName } from "./phone.js";

export interface ChatListItem {
  userPhone: string;
  displayName: string;
  preview: string;
  updatedAt: string;
  unread: number;
  messageCount: number;
}

export async function buildConversationList(tenantId: string): Promise<ChatListItem[]> {
  const prisma = getPrisma();
  const deletedKeys = await getDeletedContactKeys(tenantId);
  const [conversations, messages] = await Promise.all([
    prisma.conversation.findMany({ where: { tenantId } }),
    prisma.message.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        userPhone: true,
        body: true,
        direction: true,
        createdAt: true,
      },
    }),
  ]);

  const buckets = new Map<
    string,
    {
      userPhone: string;
      displayName: string | null;
      preview: string;
      updatedAt: Date;
      inbound: number;
      messageCount: number;
    }
  >();

  for (const c of conversations) {
    if (isCorruptPhone(c.userPhone)) continue;
    const key = contactKey(c.userPhone);
    if (deletedKeys.has(key)) continue;
    const canonical = canonicalWhatsApp(c.userPhone);
    buckets.set(key, {
      userPhone: canonical,
      displayName: c.displayName,
      preview: "",
      updatedAt: c.updatedAt,
      inbound: 0,
      messageCount: 0,
    });
  }

  for (const m of messages) {
    if (isCorruptPhone(m.userPhone)) continue;
    const key = contactKey(m.userPhone);
    if (deletedKeys.has(key)) continue;
    const canonical = canonicalWhatsApp(m.userPhone);
    let b = buckets.get(key);
    if (!b) {
      b = {
        userPhone: canonical,
        displayName: null,
        preview: "",
        updatedAt: m.createdAt,
        inbound: 0,
        messageCount: 0,
      };
      buckets.set(key, b);
    }
    b.messageCount++;
    if (m.direction === "inbound") b.inbound++;
    if (!b.preview) {
      b.preview = m.body.slice(0, 80);
      b.updatedAt = m.createdAt;
    }
    if (m.createdAt > b.updatedAt) b.updatedAt = m.createdAt;
  }

  const list: ChatListItem[] = [...buckets.values()].map((b) => ({
    userPhone: b.userPhone,
    displayName: resolveDisplayName(b.displayName, b.userPhone),
    preview: b.preview,
    updatedAt: b.updatedAt.toISOString(),
    unread: b.inbound,
    messageCount: b.messageCount,
  }));

  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return list;
}
