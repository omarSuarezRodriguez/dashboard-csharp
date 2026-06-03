import { getPrisma } from "../infrastructure/prisma.js";
import { getDeletedContactKeys } from "./deletedContacts.js";
import { canonicalWhatsApp, contactKey, isCorruptPhone, resolveDisplayName } from "./phone.js";

export interface ChatListItem {
  userPhone: string;
  displayName: string;
  preview: string;
  updatedAt: string;
  lastMessageId: string | null;
  lastInboundMessageId: string | null;
  lastDirection: "inbound" | "outbound" | null;
  unread: number;
  messageCount: number;
}

function messageDirection(
  direction: string,
): "inbound" | "outbound" | null {
  if (direction === "inbound" || direction === "outbound") return direction;
  return null;
}

function isNewerMessage(
  msgCreatedAt: Date,
  msgId: string,
  msgDirection: string,
  currentUpdatedAt: Date | null,
  currentId: string | null,
  currentDirection: "inbound" | "outbound" | null,
): boolean {
  if (!currentId || !currentUpdatedAt) return true;
  const t = msgCreatedAt.getTime();
  const cur = currentUpdatedAt.getTime();
  if (t !== cur) return t > cur;

  const dir = messageDirection(msgDirection);
  if (dir === "outbound" && currentDirection === "inbound") return true;
  if (dir === "inbound" && currentDirection === "outbound") return false;
  return msgId > currentId;
}

export async function buildConversationList(tenantId: string): Promise<ChatListItem[]> {
  const prisma = getPrisma();
  const deletedKeys = await getDeletedContactKeys(tenantId);
  const [conversations, messages] = await Promise.all([
    prisma.conversation.findMany({ where: { tenantId } }),
    prisma.message.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
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
      updatedAt: Date | null;
      lastMessageId: string | null;
      lastInboundMessageId: string | null;
      lastInboundAt: Date | null;
      lastDirection: "inbound" | "outbound" | null;
      inbound: number;
      messageCount: number;
    }
  >();

  for (const c of conversations) {
    if (isCorruptPhone(c.userPhone)) continue;
    const key = contactKey(c.userPhone);
    if (deletedKeys.has(key)) continue;
    buckets.set(key, {
      userPhone: canonicalWhatsApp(c.userPhone),
      displayName: c.displayName,
      preview: "",
      updatedAt: null,
      lastMessageId: null,
      lastInboundMessageId: null,
      lastInboundAt: null,
      lastDirection: null,
      inbound: 0,
      messageCount: 0,
    });
  }

  for (const m of messages) {
    if (isCorruptPhone(m.userPhone)) continue;
    const key = contactKey(m.userPhone);
    if (deletedKeys.has(key)) continue;

    let b = buckets.get(key);
    if (!b) {
      b = {
        userPhone: canonicalWhatsApp(m.userPhone),
        displayName: null,
        preview: "",
        updatedAt: null,
        lastMessageId: null,
        lastInboundMessageId: null,
        lastInboundAt: null,
        lastDirection: null,
        inbound: 0,
        messageCount: 0,
      };
      buckets.set(key, b);
    }

    b.messageCount++;

    if (m.direction === "inbound") {
      b.inbound++;
      if (
        isNewerMessage(
          m.createdAt,
          m.id,
          m.direction,
          b.lastInboundAt,
          b.lastInboundMessageId,
          "inbound",
        )
      ) {
        b.lastInboundMessageId = m.id;
        b.lastInboundAt = m.createdAt;
      }
    }

    if (
      isNewerMessage(
        m.createdAt,
        m.id,
        m.direction,
        b.updatedAt,
        b.lastMessageId,
        b.lastDirection,
      )
    ) {
      b.preview = m.body.slice(0, 80);
      b.updatedAt = m.createdAt;
      b.lastMessageId = m.id;
      b.lastDirection = messageDirection(m.direction);
    }
  }

  const list: ChatListItem[] = [...buckets.values()].map((b) => ({
    userPhone: b.userPhone,
    displayName: resolveDisplayName(b.displayName, b.userPhone),
    preview: b.preview,
    updatedAt: (b.updatedAt ?? new Date(0)).toISOString(),
    lastMessageId: b.lastMessageId,
    lastInboundMessageId: b.lastInboundMessageId,
    lastDirection: b.lastDirection,
    unread: b.inbound,
    messageCount: b.messageCount,
  }));

  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return list;
}
