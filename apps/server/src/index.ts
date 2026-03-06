import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  CLAIM_TIMEOUT_MS,
  DEFAULT_RECONNECT_TIMEOUT_MS,
  DEFAULT_RULE_CONFIG,
  FAST_BOT_ACTION_DELAY_MS,
  ROOM_CAPACITY,
  canClaimMingKong,
  canClaimPong,
  canHu,
  canHuWithTile,
  createWall,
  encodeServerEvent,
  isClientMessage,
  sortTiles,
  type ClaimAction,
  type DiceRoll,
  type GamePhase,
  type GameSnapshot,
  type GuestSession,
  type Meld,
  type PendingClaim,
  type PlayerPublicState,
  type PlayerSeat,
  type PlayerType,
  type RoomRuntimeState,
  type RoomStatus,
  type RoomViewModel,
  type ServerEvent,
  type SettlementResult,
  type Tile
} from "@changshu-mahjong/shared";
import { WebSocket, WebSocketServer } from "ws";
import { SERVER_PORT, WS_PATH } from "./config.js";

interface ConnectionState {
  socket: WebSocket;
  guestId: string | null;
  roomId: string | null;
}

interface PendingClaimRuntime extends PendingClaim {
  eligibleActions: Map<number, ClaimAction[]>;
  responses: Map<number, ClaimAction>;
  timer: NodeJS.Timeout | null;
}

interface GameRuntime {
  phase: GamePhase;
  dealerSeat: number;
  currentTurnSeat: number | null;
  currentDrawnTileId: string | null;
  diceRoll: DiceRoll | null;
  wall: Tile[];
  hands: Tile[][];
  discards: Tile[][];
  melds: Meld[][];
  lastDiscard: Tile | null;
  lastDiscarderSeat: number | null;
  pendingClaim: PendingClaimRuntime | null;
  settlement: SettlementResult | null;
}

interface RoomRuntime {
  room: RoomRuntimeState;
  game: GameRuntime | null;
  reconnectTimers: Map<number, NodeJS.Timeout>;
  aiTimer: NodeJS.Timeout | null;
}

class MahjongServer {
  private readonly sessions = new Map<string, GuestSession>();
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly connections = new Set<ConnectionState>();
  private readonly activeConnectionByGuest = new Map<string, ConnectionState>();

  handleConnection(socket: WebSocket): void {
    const connection: ConnectionState = {
      socket,
      guestId: null,
      roomId: null
    };

    this.connections.add(connection);

    socket.on("message", (raw) => {
      this.handleMessage(connection, raw.toString());
    });

    socket.on("close", () => {
      this.handleDisconnect(connection);
    });
  }

  getConfig(): { reconnectTimeoutMs: number; claimTimeoutMs: number; roomCapacity: number } {
    return {
      reconnectTimeoutMs: DEFAULT_RECONNECT_TIMEOUT_MS,
      claimTimeoutMs: CLAIM_TIMEOUT_MS,
      roomCapacity: ROOM_CAPACITY
    };
  }

  private handleMessage(connection: ConnectionState, raw: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(connection, "bad_payload", "消息不是合法 JSON。");
      return;
    }

    if (!isClientMessage(parsed)) {
      this.sendError(connection, "bad_payload", "消息格式不正确。");
      return;
    }

    switch (parsed.type) {
      case "session.init":
        this.handleSessionInit(connection, parsed.payload.guestId, parsed.payload.displayName);
        return;
      case "session.resume":
        this.handleSessionResume(connection, parsed.payload.guestId, parsed.payload.reconnectToken, parsed.payload.roomId);
        return;
      case "room.create":
        this.handleCreateRoom(connection, parsed.payload.displayName);
        return;
      case "room.join":
        this.handleJoinRoom(connection, parsed.payload.roomId, parsed.payload.displayName);
        return;
      case "room.leave":
        this.handleLeaveRoom(connection, parsed.payload.roomId);
        return;
      case "room.start":
        this.handleStartRoom(connection, parsed.payload.roomId);
        return;
      case "room.addBot":
        this.handleAddBot(connection, parsed.payload.roomId);
        return;
      case "room.fillBots":
        this.handleFillBots(connection, parsed.payload.roomId);
        return;
      case "room.clearBots":
        this.handleClearBots(connection, parsed.payload.roomId);
        return;
      case "room.reset":
        this.handleResetRoom(connection, parsed.payload.roomId);
        return;
      case "room.rematch":
        this.handleRematch(connection, parsed.payload.roomId);
        return;
      case "room.toggleFastMode":
        this.handleToggleFastMode(connection, parsed.payload.roomId, parsed.payload.enabled);
        return;
      case "game.discard":
        this.handleDiscard(connection, parsed.payload.roomId, parsed.payload.tileId);
        return;
      case "game.action":
        this.handleGameAction(connection, parsed.payload.roomId, parsed.payload.action);
        return;
    }
  }

  private handleSessionInit(connection: ConnectionState, guestId?: string, displayName?: string): void {
    const existing = guestId ? this.sessions.get(guestId) : undefined;
    const session =
      existing ??
      {
        guestId: this.createId("guest"),
        displayName: this.normalizeDisplayName(displayName) ?? this.createDefaultDisplayName(),
        reconnectToken: this.createId("token"),
        lastSeenAt: Date.now()
      };

    if (existing && displayName) {
      session.displayName = this.normalizeDisplayName(displayName) ?? session.displayName;
      session.reconnectToken = this.createId("token");
      session.lastSeenAt = Date.now();
    }

    this.sessions.set(session.guestId, session);
    this.bindConnectionToSession(connection, session);
    this.syncDisplayNameAcrossRooms(session.guestId, session.displayName);
    this.send(connection, {
      type: "session.ready",
      payload: session
    });
  }

  private handleSessionResume(connection: ConnectionState, guestId: string, reconnectToken: string, roomId?: string): void {
    const session = this.sessions.get(guestId);
    if (!session || session.reconnectToken !== reconnectToken) {
      this.sendError(connection, "resume_denied", "会话恢复失败，请重新进入。");
      return;
    }

    session.lastSeenAt = Date.now();
    this.bindConnectionToSession(connection, session);
    this.send(connection, {
      type: "session.ready",
      payload: session
    });

    if (roomId) {
      this.tryResumeRoom(connection, roomId);
    }
  }

  private handleCreateRoom(connection: ConnectionState, displayName?: string): void {
    const session = this.requireSession(connection);
    if (!session) {
      return;
    }

    if (connection.roomId) {
      this.sendError(connection, "already_in_room", "当前已经在房间中。");
      return;
    }

    if (displayName) {
      session.displayName = this.normalizeDisplayName(displayName) ?? session.displayName;
    }

    const roomId = this.createRoomId();
    const seats = Array.from({ length: ROOM_CAPACITY }, (_, seatIndex): PlayerSeat => ({
      seatIndex,
      guestId: null,
      displayName: null,
      playerType: "human",
      ready: false,
      online: false,
      reconnectDeadlineAt: null
    }));

    seats[0] = {
      seatIndex: 0,
      guestId: session.guestId,
      displayName: session.displayName,
      playerType: "human",
      ready: true,
      online: true,
      reconnectDeadlineAt: null
    };

    const runtime: RoomRuntime = {
      room: {
        roomId,
        hostSeatIndex: 0,
        status: "waiting",
        ruleConfig: { ...DEFAULT_RULE_CONFIG },
        seats
      },
      game: null,
      reconnectTimers: new Map(),
      aiTimer: null
    };

    this.rooms.set(roomId, runtime);
    connection.roomId = roomId;
    this.pushRoomState(runtime, session.guestId);
  }

  private handleJoinRoom(connection: ConnectionState, roomId: string, displayName?: string): void {
    const session = this.requireSession(connection);
    if (!session) {
      return;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      this.sendError(connection, "room_not_found", "房间不存在。");
      return;
    }

    if (runtime.room.status !== "waiting") {
      this.sendError(connection, "room_started", "房间已经开局，不能再加入。");
      return;
    }

    if (connection.roomId && connection.roomId !== roomId) {
      this.sendError(connection, "already_in_room", "请先离开当前房间。");
      return;
    }

    if (displayName) {
      session.displayName = this.normalizeDisplayName(displayName) ?? session.displayName;
    }

    const existingSeat = runtime.room.seats.find((seat) => seat.guestId === session.guestId);
    if (existingSeat) {
      existingSeat.online = true;
      existingSeat.displayName = session.displayName;
      existingSeat.playerType = "human";
      existingSeat.ready = true;
      existingSeat.reconnectDeadlineAt = null;
      connection.roomId = roomId;
      this.clearReconnectTimer(runtime, existingSeat.seatIndex);
      this.broadcastRoomState(roomId);
      return;
    }

    const emptySeat = runtime.room.seats.find((seat) => !seat.guestId);
    if (!emptySeat) {
      this.sendError(connection, "room_full", "房间已满。");
      return;
    }

    emptySeat.guestId = session.guestId;
    emptySeat.displayName = session.displayName;
    emptySeat.playerType = "human";
    emptySeat.ready = true;
    emptySeat.online = true;
    emptySeat.reconnectDeadlineAt = null;
    connection.roomId = roomId;
    this.broadcastRoomState(roomId);
  }

  private handleLeaveRoom(connection: ConnectionState, roomId: string): void {
    const session = this.requireSession(connection);
    if (!session) {
      return;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      this.sendError(connection, "room_not_found", "房间不存在。");
      return;
    }

    const seat = this.findSeat(runtime, session.guestId);
    if (!seat) {
      this.sendError(connection, "seat_not_found", "当前不在该房间中。");
      return;
    }

    if (runtime.room.status === "waiting") {
      runtime.room.seats[seat.seatIndex] = {
        seatIndex: seat.seatIndex,
        guestId: null,
        displayName: null,
        playerType: "human",
        ready: false,
        online: false,
        reconnectDeadlineAt: null
      };
      connection.roomId = null;
      this.reassignHost(runtime);
      if (!runtime.room.seats.some((entry) => entry.guestId && entry.playerType === "human")) {
        this.disposeRoom(runtime);
        this.rooms.delete(roomId);
        return;
      }
      if (!runtime.room.seats.some((entry) => entry.guestId)) {
        this.disposeRoom(runtime);
        this.rooms.delete(roomId);
        return;
      }
      this.broadcastRoomState(roomId);
      return;
    }

    seat.online = false;
    seat.reconnectDeadlineAt = Date.now() + runtime.room.ruleConfig.reconnectTimeoutMs;
    this.scheduleReconnectTimer(runtime, seat.seatIndex);
    connection.roomId = null;
    this.broadcastRoomState(roomId);
    this.broadcastGameState(roomId);
  }

  private handleAddBot(connection: ConnectionState, roomId: string): void {
    const session = this.requireSession(connection);
    if (!session) {
      return;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      this.sendError(connection, "room_not_found", "房间不存在。");
      return;
    }

    if (runtime.room.status !== "waiting") {
      this.sendError(connection, "room_started", "开局后不能再添加机器人。");
      return;
    }

    const seat = this.findSeat(runtime, session.guestId);
    if (!seat || seat.seatIndex !== runtime.room.hostSeatIndex) {
      this.sendError(connection, "not_host", "只有房主可以添加机器人。");
      return;
    }

    const emptySeat = runtime.room.seats.find((entry) => !entry.guestId);
    if (!emptySeat) {
      this.sendError(connection, "room_full", "房间没有空位。");
      return;
    }

    const botName = this.createBotDisplayName(runtime);
    emptySeat.guestId = this.createBotGuestId();
    emptySeat.displayName = botName;
    emptySeat.playerType = "bot";
    emptySeat.ready = true;
    emptySeat.online = true;
    emptySeat.reconnectDeadlineAt = null;
    this.broadcastRoomState(roomId);
  }

  private handleFillBots(connection: ConnectionState, roomId: string): void {
    const runtime = this.requireHostRoomAction(connection, roomId, "waiting");
    if (!runtime) {
      return;
    }

    while (runtime.room.seats.some((seat) => !seat.guestId)) {
      const emptySeat = runtime.room.seats.find((seat) => !seat.guestId);
      if (!emptySeat) {
        break;
      }
      this.assignBotToSeat(runtime, emptySeat);
    }

    this.broadcastRoomState(roomId);
  }

  private handleClearBots(connection: ConnectionState, roomId: string): void {
    const runtime = this.requireHostRoomAction(connection, roomId);
    if (!runtime) {
      return;
    }

    if (runtime.room.status === "playing") {
      this.sendError(connection, "game_in_progress", "对局进行中不能踢机器人。");
      return;
    }

    this.resetToWaitingState(runtime, {
      keepHumans: true,
      keepBots: false
    });
    this.broadcastRoomState(roomId);
  }

  private handleResetRoom(connection: ConnectionState, roomId: string): void {
    const runtime = this.requireHostRoomAction(connection, roomId);
    if (!runtime) {
      return;
    }

    if (runtime.room.status === "playing") {
      this.sendError(connection, "game_in_progress", "对局进行中不能重置房间。");
      return;
    }

    this.resetToWaitingState(runtime, {
      keepHumans: true,
      keepBots: false
    });
    this.broadcastRoomState(roomId);
  }

  private handleRematch(connection: ConnectionState, roomId: string): void {
    const runtime = this.requireHostRoomAction(connection, roomId, "settlement");
    if (!runtime) {
      return;
    }

    if (runtime.room.seats.some((seat) => !seat.guestId)) {
      this.sendError(connection, "need_four_players", "当前人数不足，不能再来一局。");
      return;
    }

    this.clearAiTimer(runtime);
    runtime.room.status = "playing";
    runtime.game = this.createGameRuntime();
    this.broadcastRoomState(roomId);
    this.broadcastGameState(roomId);
  }

  private handleToggleFastMode(connection: ConnectionState, roomId: string, enabled: boolean): void {
    const runtime = this.requireHostRoomAction(connection, roomId);
    if (!runtime) {
      return;
    }

    runtime.room.ruleConfig.botActionDelayMs = enabled ? FAST_BOT_ACTION_DELAY_MS : DEFAULT_RULE_CONFIG.botActionDelayMs;
    this.broadcastRoomState(roomId);
    if (runtime.game) {
      this.broadcastGameState(roomId);
    }
  }

  private handleStartRoom(connection: ConnectionState, roomId: string): void {
    const session = this.requireSession(connection);
    if (!session) {
      return;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      this.sendError(connection, "room_not_found", "房间不存在。");
      return;
    }

    const seat = this.findSeat(runtime, session.guestId);
    if (!seat || seat.seatIndex !== runtime.room.hostSeatIndex) {
      this.sendError(connection, "not_host", "只有房主可以开始游戏。");
      return;
    }

    if (runtime.room.status !== "waiting") {
      this.sendError(connection, "room_started", "房间已经开局。");
      return;
    }

    if (runtime.room.seats.some((entry) => !entry.guestId)) {
      this.sendError(connection, "need_four_players", "需要 4 名玩家才能开始。");
      return;
    }

    runtime.room.status = "playing";
    runtime.game = this.createGameRuntime();
    this.broadcastRoomState(roomId);
    this.broadcastGameState(roomId);
  }

  private handleDiscard(connection: ConnectionState, roomId: string, tileId: string): void {
    const session = this.requireSession(connection);
    if (!session) {
      return;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime || !runtime.game) {
      this.sendError(connection, "game_not_found", "牌局不存在。");
      return;
    }

    const seat = this.findSeat(runtime, session.guestId);
    if (!seat) {
      this.sendError(connection, "seat_not_found", "当前不在该房间中。");
      return;
    }

    if (runtime.game.phase !== "waiting_discard" || runtime.game.currentTurnSeat !== seat.seatIndex) {
      this.sendError(connection, "not_your_turn", "现在还不能出牌。");
      return;
    }

    const hand = runtime.game.hands[seat.seatIndex];
    const tileIndex = hand.findIndex((tile) => tile.id === tileId);
    if (tileIndex < 0) {
      this.sendError(connection, "tile_not_found", "手牌中不存在这张牌。");
      return;
    }

    const [tile] = hand.splice(tileIndex, 1);
    runtime.game.hands[seat.seatIndex] = sortTiles(hand);
    runtime.game.discards[seat.seatIndex].push(tile);
    runtime.game.lastDiscard = tile;
    runtime.game.lastDiscarderSeat = seat.seatIndex;
    runtime.game.currentTurnSeat = null;
    runtime.game.currentDrawnTileId = null;
    this.openClaimWindow(runtime, tile, seat.seatIndex);
  }

  private handleGameAction(connection: ConnectionState, roomId: string, action: ClaimAction): void {
    const session = this.requireSession(connection);
    if (!session) {
      return;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime || !runtime.game) {
      this.sendError(connection, "game_not_found", "牌局不存在。");
      return;
    }

    const seat = this.findSeat(runtime, session.guestId);
    if (!seat) {
      this.sendError(connection, "seat_not_found", "当前不在该房间中。");
      return;
    }

    if (runtime.game.pendingClaim) {
      const actions = runtime.game.pendingClaim.eligibleActions.get(seat.seatIndex);
      if (!actions) {
        this.sendError(connection, "not_prompted", "当前没有可处理的抢牌动作。");
        return;
      }

      if (action !== "pass" && !actions.includes(action)) {
        this.sendError(connection, "invalid_action", "当前动作不合法。");
        return;
      }

      runtime.game.pendingClaim.responses.set(seat.seatIndex, action);
      if (runtime.game.pendingClaim.eligibleSeats.every((seatIndex) => runtime.game?.pendingClaim?.responses.has(seatIndex))) {
        this.resolvePendingClaim(runtime);
      } else {
        this.broadcastGameState(roomId);
      }
      return;
    }

    if (action === "hu" && runtime.game.phase === "waiting_discard" && runtime.game.currentTurnSeat === seat.seatIndex) {
      if (!canHu(runtime.game.hands[seat.seatIndex])) {
        this.sendError(connection, "cannot_hu", "当前牌型不能胡牌。");
        return;
      }

      this.settleBySelfDraw(runtime, seat.seatIndex);
      this.broadcastRoomState(roomId);
      this.broadcastGameState(roomId);
      return;
    }

    this.sendError(connection, "invalid_action", "当前动作不合法。");
  }

  private scheduleBotAction(runtime: RoomRuntime): void {
    this.clearAiTimer(runtime);

    if (!runtime.game || runtime.room.status !== "playing") {
      return;
    }

    if (runtime.game.pendingClaim) {
      const botSeats = runtime.game.pendingClaim.eligibleSeats.filter(
        (seatIndex) => runtime.room.seats[seatIndex].playerType === "bot" && !runtime.game?.pendingClaim?.responses.has(seatIndex)
      );
      if (botSeats.length === 0) {
        return;
      }

      runtime.aiTimer = setTimeout(() => {
        const pending = runtime.game?.pendingClaim;
        if (!pending) {
          return;
        }

        for (const seatIndex of botSeats) {
          if (pending.responses.has(seatIndex)) {
            continue;
          }
          const actions = pending.eligibleActions.get(seatIndex) ?? [];
          pending.responses.set(seatIndex, this.chooseBotClaimAction(actions));
        }

        if (pending.eligibleSeats.every((seatIndex) => pending.responses.has(seatIndex))) {
          this.resolvePendingClaim(runtime);
        } else {
          this.broadcastGameState(runtime.room.roomId);
        }
      }, Math.max(80, Math.floor(runtime.room.ruleConfig.botActionDelayMs * 0.75)));
      return;
    }

    const currentTurnSeat = runtime.game.currentTurnSeat;
    if (runtime.game.phase !== "waiting_discard" || currentTurnSeat === null) {
      return;
    }

    if (runtime.room.seats[currentTurnSeat].playerType !== "bot") {
      return;
    }

    runtime.aiTimer = setTimeout(() => {
      this.playBotTurn(runtime, currentTurnSeat);
    }, runtime.room.ruleConfig.botActionDelayMs);
  }

  private playBotTurn(runtime: RoomRuntime, seatIndex: number): void {
    const game = runtime.game;
    if (!game || game.phase !== "waiting_discard" || game.currentTurnSeat !== seatIndex) {
      return;
    }

    const hand = game.hands[seatIndex];
    if (canHu(hand)) {
      this.settleBySelfDraw(runtime, seatIndex);
      this.broadcastRoomState(runtime.room.roomId);
      this.broadcastGameState(runtime.room.roomId);
      return;
    }

    const discardTile = this.chooseBotDiscard(hand);
    if (!discardTile) {
      return;
    }

    game.hands[seatIndex] = hand.filter((tile) => tile.id !== discardTile.id);
    game.discards[seatIndex].push(discardTile);
    game.lastDiscard = discardTile;
    game.lastDiscarderSeat = seatIndex;
    game.currentTurnSeat = null;
    game.currentDrawnTileId = null;
    this.openClaimWindow(runtime, discardTile, seatIndex);
  }

  private chooseBotDiscard(hand: Tile[]): Tile | null {
    if (hand.length === 0) {
      return null;
    }

    const scores = new Map<string, number>();
    for (const tile of hand) {
      const duplicateCount = hand.filter((entry) => entry.code === tile.code).length;
      const suitBias = tile.suit === "wind" || tile.suit === "dragon" ? 2 : 0;
      const edgeBias = tile.rank === 1 || tile.rank === 9 ? 1 : 0;
      scores.set(tile.id, duplicateCount * 10 - suitBias - edgeBias);
    }

    return [...hand].sort((left, right) => {
      const scoreDiff = (scores.get(left.id) ?? 0) - (scores.get(right.id) ?? 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return left.code.localeCompare(right.code);
    })[0];
  }

  private chooseBotClaimAction(actions: ClaimAction[]): ClaimAction {
    if (actions.includes("hu")) {
      return "hu";
    }
    if (actions.includes("kong")) {
      return "kong";
    }
    if (actions.includes("pong")) {
      return "pong";
    }
    return "pass";
  }

  private handleDisconnect(connection: ConnectionState): void {
    this.connections.delete(connection);

    if (!connection.guestId) {
      return;
    }

    const activeConnection = this.activeConnectionByGuest.get(connection.guestId);
    if (activeConnection === connection) {
      this.activeConnectionByGuest.delete(connection.guestId);
    }

    const roomId = connection.roomId;
    if (!roomId) {
      return;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      return;
    }

    const seat = this.findSeat(runtime, connection.guestId);
    if (!seat) {
      return;
    }

    seat.online = false;
    seat.reconnectDeadlineAt = Date.now() + runtime.room.ruleConfig.reconnectTimeoutMs;
    this.scheduleReconnectTimer(runtime, seat.seatIndex);
    this.broadcastRoomState(roomId);
    if (runtime.game) {
      this.broadcastGameState(roomId);
    }
  }

  private bindConnectionToSession(connection: ConnectionState, session: GuestSession): void {
    connection.guestId = session.guestId;

    const previous = this.activeConnectionByGuest.get(session.guestId);
    if (previous && previous !== connection) {
      previous.socket.close(1000, "replaced");
    }

    this.activeConnectionByGuest.set(session.guestId, connection);
  }

  private tryResumeRoom(connection: ConnectionState, roomId: string): void {
    if (!connection.guestId) {
      return;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      return;
    }

    const seat = this.findSeat(runtime, connection.guestId);
    if (!seat) {
      return;
    }

    seat.online = true;
    seat.reconnectDeadlineAt = null;
    connection.roomId = roomId;
    this.clearReconnectTimer(runtime, seat.seatIndex);
    this.pushRoomState(runtime, connection.guestId);
    if (runtime.game) {
      this.pushGameState(runtime, connection.guestId);
      this.broadcastGameState(roomId);
    }
  }

  private createGameRuntime(): GameRuntime {
    const wall = createWall();
    const hands = Array.from({ length: ROOM_CAPACITY }, () => [] as Tile[]);
    const discards = Array.from({ length: ROOM_CAPACITY }, () => [] as Tile[]);
    const melds = Array.from({ length: ROOM_CAPACITY }, () => [] as Meld[]);
    const diceRoll = this.rollDice();

    for (let round = 0; round < 13; round += 1) {
      for (let seatIndex = 0; seatIndex < ROOM_CAPACITY; seatIndex += 1) {
        const tile = wall.shift();
        if (tile) {
          hands[seatIndex].push(tile);
        }
      }
    }

    const dealerSeat = 0;
    const dealerTile = wall.shift();
    if (dealerTile) {
      hands[dealerSeat].push(dealerTile);
    }

    return {
      phase: "waiting_discard",
      dealerSeat,
      currentTurnSeat: dealerSeat,
      currentDrawnTileId: dealerTile?.id ?? null,
      diceRoll,
      wall,
      hands: hands.map((hand) => sortTiles(hand)),
      discards,
      melds,
      lastDiscard: null,
      lastDiscarderSeat: null,
      pendingClaim: null,
      settlement: null
    };
  }

  private openClaimWindow(runtime: RoomRuntime, tile: Tile, discarderSeat: number): void {
    const game = runtime.game;
    if (!game) {
      return;
    }

    const eligibleActions = new Map<number, ClaimAction[]>();
    for (let offset = 1; offset < ROOM_CAPACITY; offset += 1) {
      const seatIndex = (discarderSeat + offset) % ROOM_CAPACITY;
      const seat = runtime.room.seats[seatIndex];
      if (!seat.guestId) {
        continue;
      }

      const actions: ClaimAction[] = [];
      const hand = game.hands[seatIndex];

      if (canHuWithTile(hand, tile)) {
        actions.push("hu");
      }
      if (runtime.room.ruleConfig.allowMingKong && canClaimMingKong(hand, tile)) {
        actions.push("kong");
      }
      if (runtime.room.ruleConfig.allowPong && canClaimPong(hand, tile)) {
        actions.push("pong");
      }

      if (actions.length > 0) {
        eligibleActions.set(seatIndex, actions);
      }
    }

    if (eligibleActions.size === 0) {
      game.phase = "waiting_draw";
      this.advanceTurn(runtime, (discarderSeat + 1) % ROOM_CAPACITY);
      return;
    }

    const now = Date.now();
    const pending: PendingClaimRuntime = {
      tile,
      discarderSeat,
      eligibleSeats: [...eligibleActions.keys()],
      eligibleActions,
      responses: new Map(),
      promptedAt: now,
      deadlineAt: now + CLAIM_TIMEOUT_MS,
      timer: null
    };

    pending.timer = setTimeout(() => {
      this.resolvePendingClaim(runtime);
    }, CLAIM_TIMEOUT_MS);

    game.pendingClaim = pending;
    game.phase = "waiting_claim";
    this.broadcastGameState(runtime.room.roomId);
  }

  private resolvePendingClaim(runtime: RoomRuntime): void {
    const game = runtime.game;
    if (!game?.pendingClaim) {
      return;
    }

    const pending = game.pendingClaim;
    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    const winningSeat = this.chooseBestClaimSeat(pending.responses, pending.discarderSeat);
    if (winningSeat === null) {
      game.pendingClaim = null;
      game.phase = "waiting_draw";
      this.advanceTurn(runtime, (pending.discarderSeat + 1) % ROOM_CAPACITY);
      return;
    }

    const action = pending.responses.get(winningSeat);
    if (!action || action === "pass") {
      game.pendingClaim = null;
      game.phase = "waiting_draw";
      this.advanceTurn(runtime, (pending.discarderSeat + 1) % ROOM_CAPACITY);
      return;
    }

    if (action === "hu") {
      this.settleByClaim(runtime, winningSeat, pending.discarderSeat, pending.tile);
      this.broadcastRoomState(runtime.room.roomId);
      this.broadcastGameState(runtime.room.roomId);
      return;
    }

    const hand = game.hands[winningSeat];
    const consumed = this.takeTilesFromHand(hand, pending.tile.code, action === "kong" ? 3 : 2);
    const meldType = action === "kong" ? "ming-kong" : "pong";
    game.melds[winningSeat].push({
      type: meldType,
      tileCode: pending.tile.code,
      fromSeat: pending.discarderSeat,
      tiles: [...consumed, pending.tile]
    });
    game.lastDiscard = null;
    game.pendingClaim = null;
    game.currentTurnSeat = winningSeat;
    game.currentDrawnTileId = null;
    game.hands[winningSeat] = sortTiles(hand);

    if (action === "kong") {
      this.advanceTurn(runtime, winningSeat);
      return;
    }

    game.phase = "waiting_discard";
    this.broadcastGameState(runtime.room.roomId);
  }

  private advanceTurn(runtime: RoomRuntime, seatIndex: number): void {
    const game = runtime.game;
    if (!game) {
      return;
    }

    const tile = game.wall.shift();
    if (!tile) {
      this.settleAsDraw(runtime);
      this.broadcastRoomState(runtime.room.roomId);
      this.broadcastGameState(runtime.room.roomId);
      return;
    }

    game.hands[seatIndex].push(tile);
    game.hands[seatIndex] = sortTiles(game.hands[seatIndex]);
    game.currentTurnSeat = seatIndex;
    game.currentDrawnTileId = tile.id;
    game.phase = "waiting_discard";
    game.lastDiscard = null;
    this.broadcastGameState(runtime.room.roomId);
  }

  private settleByClaim(runtime: RoomRuntime, winnerSeat: number, loserSeat: number, winningTile: Tile): void {
    const game = runtime.game;
    if (!game) {
      return;
    }

    game.hands[winnerSeat].push(winningTile);
    game.hands[winnerSeat] = sortTiles(game.hands[winnerSeat]);
    runtime.room.status = "settlement";
    game.phase = "settlement";
    game.pendingClaim = null;
    game.currentTurnSeat = null;
    game.currentDrawnTileId = null;
    game.settlement = {
      winnerSeat,
      loserSeat,
      reason: "点炮胡牌",
      items: runtime.room.seats.map((seat) => ({
        seatIndex: seat.seatIndex,
        displayName: seat.displayName,
        scoreDelta: seat.seatIndex === winnerSeat ? 3 * runtime.room.ruleConfig.baseScore : seat.seatIndex === loserSeat ? -3 * runtime.room.ruleConfig.baseScore : 0,
        reason: seat.seatIndex === winnerSeat ? "胡牌" : seat.seatIndex === loserSeat ? "点炮" : "陪打"
      }))
    };
  }

  private settleBySelfDraw(runtime: RoomRuntime, winnerSeat: number): void {
    const game = runtime.game;
    if (!game) {
      return;
    }

    runtime.room.status = "settlement";
    game.phase = "settlement";
    game.pendingClaim = null;
    game.currentTurnSeat = null;
    game.currentDrawnTileId = null;
    game.settlement = {
      winnerSeat,
      loserSeat: null,
      reason: "自摸胡牌",
      items: runtime.room.seats.map((seat) => ({
        seatIndex: seat.seatIndex,
        displayName: seat.displayName,
        scoreDelta: seat.seatIndex === winnerSeat ? 3 * runtime.room.ruleConfig.baseScore : -1 * runtime.room.ruleConfig.baseScore,
        reason: seat.seatIndex === winnerSeat ? "自摸" : "被自摸"
      }))
    };
  }

  private settleAsDraw(runtime: RoomRuntime): void {
    const game = runtime.game;
    if (!game) {
      return;
    }

    runtime.room.status = "settlement";
    game.phase = "settlement";
    game.pendingClaim = null;
    game.currentTurnSeat = null;
    game.currentDrawnTileId = null;
    game.settlement = {
      winnerSeat: null,
      loserSeat: null,
      reason: "流局",
      items: runtime.room.seats.map((seat) => ({
        seatIndex: seat.seatIndex,
        displayName: seat.displayName,
        scoreDelta: 0,
        reason: "流局"
      }))
    };
  }

  private chooseBestClaimSeat(responses: Map<number, ClaimAction>, discarderSeat: number): number | null {
    const order = [...responses.entries()]
      .filter(([, action]) => action !== "pass")
      .sort((left, right) => {
        const priorityDiff = this.claimPriority(right[1]) - this.claimPriority(left[1]);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        const leftDistance = (left[0] - discarderSeat + ROOM_CAPACITY) % ROOM_CAPACITY;
        const rightDistance = (right[0] - discarderSeat + ROOM_CAPACITY) % ROOM_CAPACITY;
        return leftDistance - rightDistance;
      });

    return order[0]?.[0] ?? null;
  }

  private claimPriority(action: ClaimAction): number {
    switch (action) {
      case "hu":
        return 3;
      case "kong":
        return 2;
      case "pong":
        return 1;
      default:
        return 0;
    }
  }

  private clearAiTimer(runtime: RoomRuntime): void {
    if (!runtime.aiTimer) {
      return;
    }

    clearTimeout(runtime.aiTimer);
    runtime.aiTimer = null;
  }

  private scheduleReconnectTimer(runtime: RoomRuntime, seatIndex: number): void {
    this.clearReconnectTimer(runtime, seatIndex);

    const timer = setTimeout(() => {
      this.handleReconnectExpired(runtime.room.roomId, seatIndex);
    }, runtime.room.ruleConfig.reconnectTimeoutMs);

    runtime.reconnectTimers.set(seatIndex, timer);
  }

  private clearReconnectTimer(runtime: RoomRuntime, seatIndex: number): void {
    const timer = runtime.reconnectTimers.get(seatIndex);
    if (timer) {
      clearTimeout(timer);
      runtime.reconnectTimers.delete(seatIndex);
    }
  }

  private handleReconnectExpired(roomId: string, seatIndex: number): void {
    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      return;
    }

    const seat = runtime.room.seats[seatIndex];
    if (!seat.guestId || seat.online) {
      return;
    }

    if (!runtime.game || runtime.room.status !== "playing") {
      return;
    }

    if (runtime.game.pendingClaim?.eligibleSeats.includes(seatIndex) && !runtime.game.pendingClaim.responses.has(seatIndex)) {
      runtime.game.pendingClaim.responses.set(seatIndex, "pass");
      if (runtime.game.pendingClaim.eligibleSeats.every((entry) => runtime.game?.pendingClaim?.responses.has(entry))) {
        this.resolvePendingClaim(runtime);
      } else {
        this.broadcastGameState(roomId);
      }
      return;
    }

    if (runtime.game.currentTurnSeat === seatIndex && runtime.game.phase === "waiting_discard") {
      const hand = runtime.game.hands[seatIndex];
      const tile = hand[hand.length - 1];
      if (tile) {
        runtime.game.hands[seatIndex] = hand.filter((entry) => entry.id !== tile.id);
        runtime.game.discards[seatIndex].push(tile);
        runtime.game.lastDiscard = tile;
        runtime.game.lastDiscarderSeat = seatIndex;
        runtime.game.currentTurnSeat = null;
        runtime.game.currentDrawnTileId = null;
        this.openClaimWindow(runtime, tile, seatIndex);
      }
    }
  }

  private pushRoomState(runtime: RoomRuntime, guestId: string): void {
    const connection = this.activeConnectionByGuest.get(guestId);
    if (!connection || connection.roomId !== runtime.room.roomId) {
      return;
    }

    this.send(connection, {
      type: "room.snapshot",
      payload: this.createRoomSnapshot(runtime, guestId)
    });
  }

  private pushGameState(runtime: RoomRuntime, guestId: string): void {
    if (!runtime.game) {
      return;
    }

    const connection = this.activeConnectionByGuest.get(guestId);
    if (!connection || connection.roomId !== runtime.room.roomId) {
      return;
    }

    this.send(connection, {
      type: "game.snapshot",
      payload: this.createGameSnapshot(runtime, guestId)
    });
  }

  private broadcastRoomState(roomId: string): void {
    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      return;
    }

    for (const seat of runtime.room.seats) {
      if (!seat.guestId) {
        continue;
      }
      this.pushRoomState(runtime, seat.guestId);
    }
  }

  private broadcastGameState(roomId: string): void {
    const runtime = this.rooms.get(roomId);
    if (!runtime?.game) {
      return;
    }

    for (const seat of runtime.room.seats) {
      if (!seat.guestId) {
        continue;
      }
      this.pushGameState(runtime, seat.guestId);
    }

    this.scheduleBotAction(runtime);
  }

  private createRoomSnapshot(runtime: RoomRuntime, guestId: string): RoomViewModel {
    const selfSeat = this.findSeat(runtime, guestId);
    return {
      roomId: runtime.room.roomId,
      hostSeatIndex: runtime.room.hostSeatIndex,
      status: runtime.room.status,
      selfSeatIndex: selfSeat?.seatIndex ?? null,
      ruleConfig: runtime.room.ruleConfig,
      seats: runtime.room.seats.map((seat) => this.createPublicSeat(runtime, seat.seatIndex))
    };
  }

  private createGameSnapshot(runtime: RoomRuntime, guestId: string): GameSnapshot {
    const game = runtime.game;
    const selfSeat = this.findSeat(runtime, guestId);
    const fullHand = selfSeat ? game?.hands[selfSeat.seatIndex] ?? [] : [];
    const drawnTile =
      selfSeat && game?.currentTurnSeat === selfSeat.seatIndex && game.currentDrawnTileId
        ? fullHand.find((tile) => tile.id === game.currentDrawnTileId) ?? null
        : null;
    const hand = drawnTile ? fullHand.filter((tile) => tile.id !== drawnTile.id) : fullHand;
    const availableActions = this.getAvailableActions(runtime, selfSeat?.seatIndex ?? null);

    return {
      roomId: runtime.room.roomId,
      status: runtime.room.status,
      phase: game?.phase ?? "idle",
      currentTurnSeat: game?.currentTurnSeat ?? null,
      dealerSeat: game?.dealerSeat ?? null,
      wallCount: game?.wall.length ?? 0,
      diceRoll: game?.diceRoll ?? null,
      lastDiscard: game?.lastDiscard ?? null,
      pendingClaim: game?.pendingClaim
        ? {
            tile: game.pendingClaim.tile,
            discarderSeat: game.pendingClaim.discarderSeat,
            eligibleSeats: game.pendingClaim.eligibleSeats,
            promptedAt: game.pendingClaim.promptedAt,
            deadlineAt: game.pendingClaim.deadlineAt
          }
        : null,
      seats: runtime.room.seats.map((seat) => this.createPublicSeat(runtime, seat.seatIndex)),
      self: selfSeat
        ? {
            seatIndex: selfSeat.seatIndex,
            hand,
            drawnTile
          }
        : null,
      availableActions,
      settlement: game?.settlement ?? null
    };
  }

  private rollDice(): DiceRoll {
    const first = Math.floor(Math.random() * 6) + 1;
    const second = Math.floor(Math.random() * 6) + 1;
    return {
      first,
      second,
      total: first + second
    };
  }

  private getAvailableActions(runtime: RoomRuntime, seatIndex: number | null): ClaimAction[] {
    if (seatIndex === null || !runtime.game) {
      return [];
    }

    if (runtime.game.pendingClaim) {
      const actions = runtime.game.pendingClaim.eligibleActions.get(seatIndex);
      return actions ? [...actions, "pass"] : [];
    }

    if (runtime.game.phase === "waiting_discard" && runtime.game.currentTurnSeat === seatIndex && canHu(runtime.game.hands[seatIndex])) {
      return ["hu"];
    }

    return [];
  }

  private createPublicSeat(runtime: RoomRuntime, seatIndex: number): PlayerPublicState {
    const seat = runtime.room.seats[seatIndex];
    return {
      seatIndex,
      guestId: seat.guestId,
      displayName: seat.displayName,
      playerType: seat.playerType,
      ready: seat.ready,
      online: seat.online,
      reconnectDeadlineAt: seat.reconnectDeadlineAt,
      handCount: runtime.game ? runtime.game.hands[seatIndex].length : 0,
      discards: runtime.game ? runtime.game.discards[seatIndex] : [],
      melds: runtime.game ? runtime.game.melds[seatIndex] : []
    };
  }

  private findSeat(runtime: RoomRuntime, guestId: string): PlayerSeat | undefined {
    return runtime.room.seats.find((seat) => seat.guestId === guestId);
  }

  private requireHostRoomAction(connection: ConnectionState, roomId: string, expectedStatus?: RoomStatus): RoomRuntime | null {
    const session = this.requireSession(connection);
    if (!session) {
      return null;
    }

    const runtime = this.rooms.get(roomId);
    if (!runtime) {
      this.sendError(connection, "room_not_found", "房间不存在。");
      return null;
    }

    const seat = this.findSeat(runtime, session.guestId);
    if (!seat || seat.seatIndex !== runtime.room.hostSeatIndex || seat.playerType !== "human") {
      this.sendError(connection, "not_host", "只有房主可以执行这个操作。");
      return null;
    }

    if (expectedStatus && runtime.room.status !== expectedStatus) {
      this.sendError(connection, "room_status_invalid", "当前房间状态不支持这个操作。");
      return null;
    }

    return runtime;
  }

  private requireSession(connection: ConnectionState): GuestSession | null {
    if (!connection.guestId) {
      this.sendError(connection, "session_required", "请先初始化会话。");
      return null;
    }

    const session = this.sessions.get(connection.guestId);
    if (!session) {
      this.sendError(connection, "session_required", "会话不存在，请刷新页面。");
      return null;
    }

    session.lastSeenAt = Date.now();
    return session;
  }

  private send(connection: ConnectionState, event: ServerEvent): void {
    if (connection.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    connection.socket.send(encodeServerEvent(event));
  }

  private sendError(connection: ConnectionState, code: string, message: string): void {
    this.send(connection, {
      type: "session.error",
      payload: {
        code,
        message
      }
    });
  }

  private createRoomId(): string {
    let roomId = "";
    do {
      roomId = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.rooms.has(roomId));
    return roomId;
  }

  private createId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  }

  private createDefaultDisplayName(): string {
    return `雀友${Math.floor(1000 + Math.random() * 9000)}`;
  }

  private normalizeDisplayName(displayName?: string): string | null {
    const value = displayName?.trim();
    return value ? value.slice(0, 12) : null;
  }

  private reassignHost(runtime: RoomRuntime): void {
    const nextHost =
      runtime.room.seats.find((seat) => seat.guestId && seat.playerType === "human") ??
      runtime.room.seats.find((seat) => seat.guestId);
    runtime.room.hostSeatIndex = nextHost?.seatIndex ?? 0;
  }

  private createEmptySeat(seatIndex: number): PlayerSeat {
    return {
      seatIndex,
      guestId: null,
      displayName: null,
      playerType: "human",
      ready: false,
      online: false,
      reconnectDeadlineAt: null
    };
  }

  private assignBotToSeat(runtime: RoomRuntime, seat: PlayerSeat): void {
    seat.guestId = this.createBotGuestId();
    seat.displayName = this.createBotDisplayName(runtime);
    seat.playerType = "bot";
    seat.ready = true;
    seat.online = true;
    seat.reconnectDeadlineAt = null;
  }

  private resetToWaitingState(runtime: RoomRuntime, options: { keepHumans: boolean; keepBots: boolean }): void {
    this.disposeRoom(runtime);
    runtime.room.status = "waiting";
    runtime.game = null;

    runtime.room.seats = runtime.room.seats.map((seat) => {
      if (!seat.guestId) {
        return this.createEmptySeat(seat.seatIndex);
      }

      if (seat.playerType === "human") {
        if (!options.keepHumans) {
          return this.createEmptySeat(seat.seatIndex);
        }

        return {
          ...seat,
          ready: true,
          reconnectDeadlineAt: null
        };
      }

      if (!options.keepBots) {
        return this.createEmptySeat(seat.seatIndex);
      }

      return {
        ...seat,
        ready: true,
        online: true,
        reconnectDeadlineAt: null
      };
    });

    this.reassignHost(runtime);
  }

  private disposeRoom(runtime: RoomRuntime): void {
    this.clearAiTimer(runtime);
    for (const timer of runtime.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    runtime.reconnectTimers.clear();
  }

  private takeTilesFromHand(hand: Tile[], tileCode: string, count: number): Tile[] {
    const matches = hand.filter((tile) => tile.code === tileCode).slice(0, count);
    for (const tile of matches) {
      const index = hand.findIndex((entry) => entry.id === tile.id);
      if (index >= 0) {
        hand.splice(index, 1);
      }
    }
    return matches;
  }

  private syncDisplayNameAcrossRooms(guestId: string, displayName: string): void {
    for (const runtime of this.rooms.values()) {
      const seat = this.findSeat(runtime, guestId);
      if (!seat) {
        continue;
      }

      seat.displayName = displayName;
      this.broadcastRoomState(runtime.room.roomId);
      if (runtime.game) {
        this.broadcastGameState(runtime.room.roomId);
      }
    }
  }

  private createBotGuestId(): string {
    return this.createId("bot");
  }

  private createBotDisplayName(runtime: RoomRuntime): string {
    const existingBots = runtime.room.seats.filter((seat) => seat.playerType === "bot" && seat.guestId).length;
    return `测试机器人${existingBots + 1}`;
  }
}

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true
});

const mahjongServer = new MahjongServer();

app.get("/health", async () => ({
  status: "ok",
  date: new Date().toISOString()
}));

app.get("/config", async () => mahjongServer.getConfig());

await app.listen({
  port: SERVER_PORT,
  host: "0.0.0.0"
});

const websocketServer = new WebSocketServer({
  server: app.server,
  path: WS_PATH
});

websocketServer.on("connection", (socket) => {
  mahjongServer.handleConnection(socket);
});
