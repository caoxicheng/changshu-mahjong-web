import type { ClientMessage, ServerEvent } from "./types.js";

export function isClientMessage(input: unknown): input is ClientMessage {
  if (!input || typeof input !== "object") {
    return false;
  }

  const maybeMessage = input as { type?: unknown; payload?: unknown };
  return typeof maybeMessage.type === "string" && "payload" in maybeMessage;
}

export function encodeServerEvent(event: ServerEvent): string {
  return JSON.stringify(event);
}
