import type {
  MessageInstance,
  MessagePage,
} from "twilio/lib/rest/api/v2010/account/message.js";
import twilio from "twilio";
import type { AppLogger } from "../infrastructure/logger.js";
import { getPrisma } from "../infrastructure/prisma.js";
import { getDeletedContactKeys } from "./deletedContacts.js";
import { contactKey, ensureWhatsApp } from "./phone.js";

const DEFAULT_HISTORY_DAYS = 90;
const PAGE_SIZE = 1000;

export class TwilioMessageSync {
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;
  private lastStats = { imported: 0, scanned: 0, finishedAt: null as Date | null };

  constructor(
    private readonly tenantId: string,
    private readonly ourNumber: string,
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly logger: AppLogger,
    private readonly intervalMs: number,
  ) {}

  getStats() {
    return this.lastStats;
  }

  start(): void {
    if (this.timer) return;
    const historyDays = parseInt(process.env.SYNC_HISTORY_DAYS ?? String(DEFAULT_HISTORY_DAYS), 10);
    void this.syncFull(historyDays).then(() => {
      this.timer = setInterval(() => void this.syncOnce(), this.intervalMs);
    });
    this.logger.info(
      { intervalMs: this.intervalMs, historyDays },
      "Dashboard: sync Twilio (historial completo al iniciar)",
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncOnce(): Promise<void> {
    const days = Math.min(14, parseInt(process.env.SYNC_RECENT_DAYS ?? "14", 10));
    await this.runSync(days);
  }

  async syncFull(days?: number): Promise<void> {
    const historyDays =
      days ?? parseInt(process.env.SYNC_HISTORY_DAYS ?? String(DEFAULT_HISTORY_DAYS), 10);
    await this.runSync(historyDays);
  }

  private dateSentAfter(days: number): Date {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return since;
  }

  private async runSync(historyDays: number): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    let imported = 0;
    let scanned = 0;

    try {
      const client = twilio(this.accountSid, this.authToken);
      const ourKey = contactKey(this.ourNumber);
      const dateSentAfter = this.dateSentAfter(historyDays);
      const prisma = getPrisma();
      const deletedKeys = await getDeletedContactKeys(this.tenantId);

      let page: MessagePage = await client.messages.page({
        pageSize: PAGE_SIZE,
        dateSentAfter,
      });

      for (;;) {
        for (const msg of page.instances) {
          scanned++;
          const added = await this.importMessage(prisma, msg, ourKey, deletedKeys);
          if (added) imported++;
        }
        const next = (await page.nextPage()) as MessagePage | undefined;
        if (!next) break;
        page = next;
      }

      this.lastStats = { imported, scanned, finishedAt: new Date() };
      if (imported > 0) {
        this.logger.info({ imported, scanned, historyDays }, "Sync Twilio: mensajes nuevos");
      }
    } catch (err) {
      this.logger.error({ err }, "Sync Twilio falló");
    } finally {
      this.syncing = false;
    }
  }

  private async importMessage(
    prisma: ReturnType<typeof getPrisma>,
    msg: MessageInstance,
    ourKey: string,
    deletedKeys: Set<string>,
  ): Promise<boolean> {
    const sid = msg.sid;
    const body = (msg.body ?? "").trim();
    if (!sid || !body) return false;

    const from = msg.from ?? "";
    const to = msg.to ?? "";
    const fromKey = contactKey(from);
    const toKey = contactKey(to);
    const direction = (msg.direction ?? "").toLowerCase();

    let userPhone: string | null = null;
    let msgDirection: "inbound" | "outbound" | null = null;

    if (direction === "inbound" && toKey === ourKey) {
      userPhone = ensureWhatsApp(from);
      msgDirection = "inbound";
    } else if (direction.startsWith("outbound") && fromKey === ourKey) {
      userPhone = ensureWhatsApp(to);
      msgDirection = "outbound";
    }

    if (!userPhone || !msgDirection) return false;

    if (deletedKeys.has(contactKey(userPhone))) return false;

    const exists = await prisma.message.findUnique({
      where: { twilioMessageSid: sid },
      select: { id: true },
    });
    if (exists) return false;

    await prisma.conversation.upsert({
      where: {
        tenantId_userPhone: { tenantId: this.tenantId, userPhone },
      },
      create: { tenantId: this.tenantId, userPhone, step: "idle", context: {} },
      update: { updatedAt: new Date() },
    });

    const sentAt = msg.dateSent ?? msg.dateCreated ?? new Date();
    await prisma.message.create({
      data: {
        tenantId: this.tenantId,
        userPhone,
        direction: msgDirection,
        body,
        twilioMessageSid: sid,
        createdAt: sentAt,
      },
    });

    return true;
  }
}
