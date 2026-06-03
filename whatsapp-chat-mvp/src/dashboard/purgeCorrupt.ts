import type { AppLogger } from "../infrastructure/logger.js";
import { getPrisma } from "../infrastructure/prisma.js";
import { markContactDeleted } from "./deletedContacts.js";
import { isCorruptPhone } from "./phone.js";

/** Elimina chats con teléfonos corruptos (whatsapp:+_raw:...) y los bloquea en sync. */
export async function purgeCorruptContacts(
  tenantId: string,
  logger?: AppLogger,
): Promise<{ messages: number; conversations: number }> {
  const prisma = getPrisma();
  const [messages, conversations] = await Promise.all([
    prisma.message.findMany({
      where: { tenantId },
      select: { id: true, userPhone: true },
    }),
    prisma.conversation.findMany({
      where: { tenantId },
      select: { userPhone: true },
    }),
  ]);

  const corruptPhones = new Set<string>();
  for (const row of [...messages, ...conversations]) {
    if (isCorruptPhone(row.userPhone)) corruptPhones.add(row.userPhone);
  }

  if (!corruptPhones.size) return { messages: 0, conversations: 0 };

  const msgIds = messages
    .filter((m) => corruptPhones.has(m.userPhone))
    .map((m) => m.id);

  await prisma.message.deleteMany({ where: { id: { in: msgIds } } });

  let convDeleted = 0;
  for (const phone of corruptPhones) {
    await prisma.conversation
      .delete({
        where: { tenantId_userPhone: { tenantId, userPhone: phone } },
      })
      .then(() => convDeleted++)
      .catch(() => undefined);
    await markContactDeleted(tenantId, phone);
  }

  logger?.info(
    { corruptPhones: [...corruptPhones], messages: msgIds.length },
    "Chats corruptos eliminados",
  );
  return { messages: msgIds.length, conversations: convDeleted };
}
