import { EventEmitter } from "node:events";

export type InboxEvent =
  | { type: "incoming"; subscriberId: string; contactId: string }
  | { type: "read"; subscriberId: string };

const globalForEvents = globalThis as unknown as { inboxEvents?: EventEmitter };

/** Один эмиттер на процесс: вебхук кладёт сюда событие, открытые вкладки его слушают. */
export const inboxEvents: EventEmitter =
  globalForEvents.inboxEvents ?? new EventEmitter().setMaxListeners(0);

globalForEvents.inboxEvents = inboxEvents;

export function notifyIncoming(event: InboxEvent): void {
  inboxEvents.emit("inbox", event);
}

/** Диалог просмотрели — счётчик в меню должен погаснуть сразу. */
export function notifyRead(subscriberId: string): void {
  inboxEvents.emit("inbox", { type: "read", subscriberId });
}
