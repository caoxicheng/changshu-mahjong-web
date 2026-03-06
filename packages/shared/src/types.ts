export type RoomStatus = "waiting" | "playing" | "settlement";
export type GamePhase = "idle" | "waiting_draw" | "waiting_discard" | "waiting_claim" | "settlement";
export type ClaimAction = "pass" | "pong" | "kong" | "hu";
export type TileSuit = "wan" | "tong" | "tiao" | "wind" | "dragon";
export type PlayerType = "human" | "bot";

export interface GuestSession {
  guestId: string;
  displayName: string;
  reconnectToken: string;
  lastSeenAt: number;
}

export interface PlayerSeat {
  seatIndex: number;
  guestId: string | null;
  displayName: string | null;
  playerType: PlayerType;
  ready: boolean;
  online: boolean;
  reconnectDeadlineAt: number | null;
}

export interface RuleConfig {
  allowChi: boolean;
  allowPong: boolean;
  allowMingKong: boolean;
  allowAnKong: boolean;
  allowBuKong: boolean;
  enableFlowers: boolean;
  reconnectTimeoutMs: number;
  baseScore: number;
  botActionDelayMs: number;
}

export interface Tile {
  id: string;
  suit: TileSuit;
  rank: number;
  code: string;
}

export interface Meld {
  type: "pong" | "ming-kong";
  tileCode: string;
  fromSeat: number;
  tiles: Tile[];
}

export interface PlayerPublicState {
  seatIndex: number;
  guestId: string | null;
  displayName: string | null;
  playerType: PlayerType;
  ready: boolean;
  online: boolean;
  reconnectDeadlineAt: number | null;
  handCount: number;
  discards: Tile[];
  melds: Meld[];
}

export interface ClaimPrompt {
  seatIndex: number;
  tile: Tile;
  actions: ClaimAction[];
  deadlineAt: number;
}

export interface PendingClaim {
  tile: Tile;
  discarderSeat: number;
  eligibleSeats: number[];
  promptedAt: number;
  deadlineAt: number;
}

export interface SettlementItem {
  seatIndex: number;
  displayName: string | null;
  scoreDelta: number;
  reason: string;
}

export interface SettlementResult {
  winnerSeat: number | null;
  loserSeat: number | null;
  reason: string;
  items: SettlementItem[];
}

export interface DiceRoll {
  first: number;
  second: number;
  total: number;
}

export interface PlayerPrivateState {
  seatIndex: number;
  hand: Tile[];
  drawnTile: Tile | null;
}

export interface RoomViewModel {
  roomId: string;
  hostSeatIndex: number;
  status: RoomStatus;
  seats: PlayerPublicState[];
  selfSeatIndex: number | null;
  ruleConfig: RuleConfig;
}

export interface GameSnapshot {
  roomId: string;
  status: RoomStatus;
  phase: GamePhase;
  currentTurnSeat: number | null;
  dealerSeat: number | null;
  wallCount: number;
  diceRoll: DiceRoll | null;
  lastDiscard: Tile | null;
  pendingClaim: PendingClaim | null;
  seats: PlayerPublicState[];
  self: PlayerPrivateState | null;
  availableActions: ClaimAction[];
  settlement: SettlementResult | null;
}

export interface RoomRuntimeState {
  roomId: string;
  hostSeatIndex: number;
  status: RoomStatus;
  ruleConfig: RuleConfig;
  seats: PlayerSeat[];
}

export interface InitSessionMessage {
  type: "session.init";
  payload: {
    guestId?: string;
    displayName?: string;
  };
}

export interface ResumeSessionMessage {
  type: "session.resume";
  payload: {
    guestId: string;
    roomId?: string;
    reconnectToken: string;
  };
}

export interface CreateRoomMessage {
  type: "room.create";
  payload: {
    displayName?: string;
  };
}

export interface JoinRoomMessage {
  type: "room.join";
  payload: {
    roomId: string;
    displayName?: string;
  };
}

export interface LeaveRoomMessage {
  type: "room.leave";
  payload: {
    roomId: string;
  };
}

export interface StartRoomMessage {
  type: "room.start";
  payload: {
    roomId: string;
  };
}

export interface AddBotMessage {
  type: "room.addBot";
  payload: {
    roomId: string;
  };
}

export interface FillBotsMessage {
  type: "room.fillBots";
  payload: {
    roomId: string;
  };
}

export interface ClearBotsMessage {
  type: "room.clearBots";
  payload: {
    roomId: string;
  };
}

export interface ResetRoomMessage {
  type: "room.reset";
  payload: {
    roomId: string;
  };
}

export interface RematchMessage {
  type: "room.rematch";
  payload: {
    roomId: string;
  };
}

export interface ToggleFastModeMessage {
  type: "room.toggleFastMode";
  payload: {
    roomId: string;
    enabled: boolean;
  };
}

export interface DiscardMessage {
  type: "game.discard";
  payload: {
    roomId: string;
    tileId: string;
  };
}

export interface ClaimActionMessage {
  type: "game.action";
  payload: {
    roomId: string;
    action: ClaimAction;
  };
}

export type ClientMessage =
  | InitSessionMessage
  | ResumeSessionMessage
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | StartRoomMessage
  | AddBotMessage
  | FillBotsMessage
  | ClearBotsMessage
  | ResetRoomMessage
  | RematchMessage
  | ToggleFastModeMessage
  | DiscardMessage
  | ClaimActionMessage;

export interface SessionReadyEvent {
  type: "session.ready";
  payload: GuestSession;
}

export interface SessionErrorEvent {
  type: "session.error";
  payload: {
    code: string;
    message: string;
  };
}

export interface RoomSnapshotEvent {
  type: "room.snapshot";
  payload: RoomViewModel;
}

export interface GameSnapshotEvent {
  type: "game.snapshot";
  payload: GameSnapshot;
}

export interface ServerInfoEvent {
  type: "server.info";
  payload: {
    message: string;
  };
}

export type ServerEvent = SessionReadyEvent | SessionErrorEvent | RoomSnapshotEvent | GameSnapshotEvent | ServerInfoEvent;
