import type { RuleConfig } from "./types.js";

export const DEFAULT_RECONNECT_TIMEOUT_MS = 180_000;

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  allowChi: false,
  allowPong: true,
  allowMingKong: true,
  allowAnKong: false,
  allowBuKong: false,
  enableFlowers: false,
  reconnectTimeoutMs: DEFAULT_RECONNECT_TIMEOUT_MS,
  baseScore: 1,
  botActionDelayMs: 900
};

export const ROOM_CAPACITY = 4;
export const CLAIM_TIMEOUT_MS = 8_000;
export const FAST_BOT_ACTION_DELAY_MS = 120;
