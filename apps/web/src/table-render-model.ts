import type { ClaimAction, DiceRoll, GameSnapshot, Meld, PlayerPublicState, Tile } from "@changshu-mahjong/shared";

export type TableSeatPosition = "top" | "left" | "right" | "bottom";
export type DiscardDensity = "regular" | "dense" | "ultra";

export interface TableSeatRenderModel {
  seatIndex: number;
  position: TableSeatPosition;
  displayName: string;
  playerType: PlayerPublicState["playerType"];
  online: boolean;
  handCount: number;
  isActive: boolean;
  discards: Tile[];
  discardDensity: DiscardDensity;
  melds: Meld[];
}

export interface TableCenterRenderModel {
  roomId: string;
  wallCount: number;
  diceRoll: DiceRoll | null;
  turnLabel: string;
  statusLabel: string;
  lastDiscard: Tile | null;
}

export interface TableRenderModel {
  center: TableCenterRenderModel;
  opponents: {
    top: TableSeatRenderModel;
    left: TableSeatRenderModel;
    right: TableSeatRenderModel;
  };
  self: TableSeatRenderModel;
  availableActions: ClaimAction[];
}

interface BuildTableRenderModelOptions {
  roomId: string;
  game: GameSnapshot;
  selfSeatIndex: number | null;
}

export function buildTableRenderModel({ roomId, game, selfSeatIndex }: BuildTableRenderModelOptions): TableRenderModel {
  const anchorSeat = selfSeatIndex ?? 0;
  const topSeatIndex = (anchorSeat + 2) % game.seats.length;
  const leftSeatIndex = (anchorSeat + 1) % game.seats.length;
  const rightSeatIndex = (anchorSeat + 3) % game.seats.length;

  const center: TableCenterRenderModel = {
    roomId,
    wallCount: game.wallCount,
    diceRoll: game.diceRoll,
    turnLabel:
      game.currentTurnSeat === null
        ? "等待结算"
        : game.seats[game.currentTurnSeat]?.displayName ?? `座位 ${game.currentTurnSeat + 1}`,
    statusLabel:
      game.phase === "waiting_discard"
        ? "出牌阶段"
        : game.phase === "waiting_claim"
          ? "响应阶段"
          : game.phase === "settlement"
            ? "结算阶段"
            : "摸牌阶段",
    lastDiscard: game.lastDiscard
  };

  return {
    center,
    opponents: {
      top: createSeatRenderModel(game.seats[topSeatIndex], "top", game.currentTurnSeat),
      left: createSeatRenderModel(game.seats[leftSeatIndex], "left", game.currentTurnSeat),
      right: createSeatRenderModel(game.seats[rightSeatIndex], "right", game.currentTurnSeat)
    },
    self: createSeatRenderModel(game.seats[anchorSeat], "bottom", game.currentTurnSeat),
    availableActions: game.availableActions
  };
}

function createSeatRenderModel(
  seat: PlayerPublicState | undefined,
  position: TableSeatPosition,
  currentTurnSeat: number | null
): TableSeatRenderModel {
  const discards = seat?.discards ?? [];

  return {
    seatIndex: seat?.seatIndex ?? -1,
    position,
    displayName: seat?.displayName ?? "空位",
    playerType: seat?.playerType ?? "human",
    online: seat?.online ?? false,
    handCount: seat?.handCount ?? 0,
    isActive: seat?.seatIndex === currentTurnSeat,
    discards,
    discardDensity: getDiscardDensity(discards.length),
    melds: seat?.melds ?? []
  };
}

function getDiscardDensity(count: number): DiscardDensity {
  if (count >= 18) {
    return "ultra";
  }
  if (count >= 10) {
    return "dense";
  }
  return "regular";
}
