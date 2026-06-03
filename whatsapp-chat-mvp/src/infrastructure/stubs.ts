import type { MessageQueue, OutboundMessenger } from "../application/ports.js";
import type { Tenant } from "../domain/types.js";

/** MVP: outbound via synchronous TwiML only */
export class NoOpOutboundMessenger implements OutboundMessenger {
  async send(_tenant: Tenant, _to: string, _body: string): Promise<void> {
    return;
  }
}

export class NoOpMessageQueue implements MessageQueue {
  async enqueue(_job: unknown): Promise<void> {
    return;
  }
}
