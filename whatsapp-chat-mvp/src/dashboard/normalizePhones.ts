import type { AppLogger } from "../infrastructure/logger.js";
import { getPrisma } from "../infrastructure/prisma.js";
import { canonicalWhatsApp, contactKey } from "./phone.js";

/** Une teléfonos con distinto formato (whatsapp:+57 / +57) en un solo chat */
export async function normalizeTenantPhones(
  tenantId: string,
  logger?: AppLogger,
): Promise<{ messagesUpdated: number; conversationsMerged: number }> {
  const prisma = getPrisma();
  let messagesUpdated = 0;
  let conversationsMerged = 0;

  const messages = await prisma.message.findMany({
    where: { tenantId },
    select: { id: true, userPhone: true },
  });

  for (const m of messages) {
    const canonical = canonicalWhatsApp(m.userPhone);
    if (m.userPhone !== canonical) {
      await prisma.message.update({
        where: { id: m.id },
        data: { userPhone: canonical },
      });
      messagesUpdated++;
    }
  }

  const conversations = await prisma.conversation.findMany({
    where: { tenantId },
  });

  const groups = new Map<string, typeof conversations>();
  for (const c of conversations) {
    const key = contactKey(c.userPhone);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    const canonical = canonicalWhatsApp(group[0].userPhone);
    const displayName =
      group.map((g) => g.displayName?.trim()).find(Boolean) ?? null;
    const keeper = group.find((g) => g.userPhone === canonical) ?? group[0];

    if (group.length === 1 && keeper.userPhone === canonical) {
      if (displayName && keeper.displayName !== displayName) {
        await prisma.conversation.update({
          where: {
            tenantId_userPhone: { tenantId, userPhone: canonical },
          },
          data: { displayName },
        });
      }
      continue;
    }

    for (const row of group) {
      if (row.userPhone === canonical && group.length === 1) continue;
      await prisma.conversation.delete({
        where: {
          tenantId_userPhone: { tenantId, userPhone: row.userPhone },
        },
      });
      if (row.userPhone !== canonical) conversationsMerged++;
    }

    await prisma.conversation.upsert({
      where: {
        tenantId_userPhone: { tenantId, userPhone: canonical },
      },
      create: {
        tenantId,
        userPhone: canonical,
        displayName,
        step: keeper.step,
        context: keeper.context as object,
        unknownCount: keeper.unknownCount,
        lastGreetingDate: keeper.lastGreetingDate,
      },
      update: {
        displayName: displayName ?? undefined,
      },
    });
  }

  if (messagesUpdated > 0 || conversationsMerged > 0) {
    logger?.info(
      { messagesUpdated, conversationsMerged },
      "Teléfonos normalizados (duplicados unificados)",
    );
  }

  return { messagesUpdated, conversationsMerged };
}
