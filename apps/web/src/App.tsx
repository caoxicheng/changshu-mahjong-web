import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { Meld, Tile, TileSuit } from "@changshu-mahjong/shared";
import { useAppStore } from "./store";
import { buildTableRenderModel, type TableSeatRenderModel } from "./table-render-model";
import { getTileAssetUrl } from "./tile-assets";

export default function App() {
  const connect = useAppStore((state) => state.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LobbyPage() {
  const navigate = useNavigate();
  const room = useAppStore((state) => state.room);
  const session = useAppStore((state) => state.session);
  const status = useAppStore((state) => state.status);
  const error = useAppStore((state) => state.error);
  const displayNameDraft = useAppStore((state) => state.displayNameDraft);
  const roomCodeDraft = useAppStore((state) => state.roomCodeDraft);
  const setDisplayNameDraft = useAppStore((state) => state.setDisplayNameDraft);
  const setRoomCodeDraft = useAppStore((state) => state.setRoomCodeDraft);
  const saveDisplayName = useAppStore((state) => state.saveDisplayName);
  const createRoom = useAppStore((state) => state.createRoom);
  const joinRoom = useAppStore((state) => state.joinRoom);

  useEffect(() => {
    if (room?.roomId) {
      navigate(`/room/${room.roomId}`, { replace: true });
    }
  }, [navigate, room?.roomId]);

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">常熟麻将</p>
        <h1>游客即可开桌，断线继续回到原局</h1>
        <p className="hero-copy">
          首次访问会自动生成昵称，你可以在开局前随时修改。关闭网页后再次进入，仍会记住你的名字和当前身份。
        </p>
        <div className="status-bar">
          <span>连接状态：{status}</span>
          <span>当前昵称：{session?.displayName ?? "生成中"}</span>
        </div>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>身份设置</h2>
          <label className="field">
            <span>昵称</span>
            <input value={displayNameDraft} maxLength={12} onChange={(event) => setDisplayNameDraft(event.target.value)} />
          </label>
          <button className="primary-button" type="button" onClick={saveDisplayName}>
            保存昵称
          </button>
        </article>

        <article className="panel">
          <h2>快速开房</h2>
          <p className="hint">创建后会生成 6 位房间号，其他玩家可直接输入房间号加入。</p>
          <button className="primary-button" type="button" onClick={createRoom}>
            创建房间
          </button>
        </article>

        <article className="panel">
          <h2>加入房间</h2>
          <label className="field">
            <span>房间号</span>
            <input value={roomCodeDraft} maxLength={6} onChange={(event) => setRoomCodeDraft(event.target.value.replace(/\D/g, ""))} />
          </label>
          <button className="secondary-button" type="button" onClick={joinRoom}>
            加入
          </button>
        </article>
      </section>

      {error ? <div className="feedback error">{error}</div> : null}
    </main>
  );
}

function RoomPage() {
  const navigate = useNavigate();
  const params = useParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const room = useAppStore((state) => state.room);
  const game = useAppStore((state) => state.game);
  const session = useAppStore((state) => state.session);
  const connectionStatus = useAppStore((state) => state.status);
  const error = useAppStore((state) => state.error);
  const displayNameDraft = useAppStore((state) => state.displayNameDraft);
  const setDisplayNameDraft = useAppStore((state) => state.setDisplayNameDraft);
  const saveDisplayName = useAppStore((state) => state.saveDisplayName);
  const leaveRoom = useAppStore((state) => state.leaveRoom);
  const addBot = useAppStore((state) => state.addBot);
  const fillBots = useAppStore((state) => state.fillBots);
  const clearBots = useAppStore((state) => state.clearBots);
  const resetRoom = useAppStore((state) => state.resetRoom);
  const rematch = useAppStore((state) => state.rematch);
  const toggleFastMode = useAppStore((state) => state.toggleFastMode);
  const startRoom = useAppStore((state) => state.startRoom);
  const discardTile = useAppStore((state) => state.discardTile);
  const gameAction = useAppStore((state) => state.gameAction);

  useEffect(() => {
    if (!room) {
      return;
    }
    if (params.roomId && room.roomId !== params.roomId) {
      navigate(`/room/${room.roomId}`, { replace: true });
    }
  }, [navigate, params.roomId, room]);

  if (!room) {
    return <Navigate to="/" replace />;
  }

  const selfSeatIndex = room.selfSeatIndex ?? -1;
  const isHost = room.hostSeatIndex === selfSeatIndex;
  const gameView = game && room.status !== "waiting";
  const self = game?.self;
  const canDiscard = game?.phase === "waiting_discard" && game.currentTurnSeat === selfSeatIndex;
  const isFastMode = room.ruleConfig.botActionDelayMs <= 200;
  const drawnTile = self?.drawnTile ?? null;
  const baseHand = self?.hand ?? [];
  const tableModel = gameView && game ? buildTableRenderModel({ roomId: room.roomId, game, selfSeatIndex: room.selfSeatIndex }) : null;

  return (
    <main className={`page-shell room-shell ${gameView ? "in-game-shell" : ""} ${room.status === "waiting" ? "waiting-room-shell" : ""}`}>
      <section className="hero-card compact">
        <div className="room-header">
          <div>
            <p className="eyebrow">房间号</p>
            <h1>{room.roomId}</h1>
          </div>
          <div className="room-actions">
            {room.status === "waiting" && isHost ? (
              <>
                <button className="secondary-button" type="button" onClick={addBot}>
                  添加机器人
                </button>
                <button className="secondary-button" type="button" onClick={fillBots}>
                  一键补满
                </button>
                <button className="secondary-button" type="button" onClick={clearBots}>
                  清空机器人
                </button>
                <button className="secondary-button" type="button" onClick={resetRoom}>
                  重置房间
                </button>
                <button className="secondary-button" type="button" onClick={() => toggleFastMode(!isFastMode)}>
                  {isFastMode ? "关闭快进" : "测试快进"}
                </button>
                <button className="secondary-button" type="button" onClick={leaveRoom}>
                  离开房间
                </button>
              </>
            ) : room.status === "waiting" ? (
              <button className="secondary-button" type="button" onClick={leaveRoom}>
                离开房间
              </button>
            ) : room.status === "settlement" && isHost ? (
              <>
                <button className="primary-button" type="button" onClick={rematch}>
                  再来一局
                </button>
                <button className="secondary-button" type="button" onClick={clearBots}>
                  清空机器人
                </button>
                <button className="secondary-button" type="button" onClick={resetRoom}>
                  重置房间
                </button>
                <button className="secondary-button" type="button" onClick={() => toggleFastMode(!isFastMode)}>
                  {isFastMode ? "关闭快进" : "测试快进"}
                </button>
              </>
            ) : (
              <span className="hint">关闭页面后会保留席位，等待断线重连。</span>
            )}
            {room.status === "waiting" && isHost ? (
              <button className="primary-button" type="button" onClick={startRoom}>
                开始游戏
              </button>
            ) : null}
          </div>
        </div>
        <div className="status-bar">
          <span>当前用户：{session?.displayName}</span>
          <span>状态：{room.status}</span>
          <span>机器人速度：{isFastMode ? "快进" : "正常"}</span>
        </div>
      </section>

      {room.status === "waiting" ? (
        <section className="waiting-layout">
          <article className="panel waiting-stage-panel">
            <h2>等待区</h2>
            <div className="seat-grid">
              {room.seats.map((seat) => (
                <div className={`seat-card ${seat.seatIndex === room.hostSeatIndex ? "host" : ""}`} key={seat.seatIndex}>
                  <div className="seat-topline">
                    <span>座位 {seat.seatIndex + 1}</span>
                    {seat.seatIndex === room.hostSeatIndex ? <span>房主</span> : null}
                  </div>
                  <strong>{seat.displayName ?? "空位"}</strong>
                  <span>{seat.playerType === "bot" ? "机器人" : "玩家"}</span>
                  <span>{seat.online ? "在线" : "离线"}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel waiting-control-panel">
            <h2>修改昵称</h2>
            <label className="field">
              <span>昵称</span>
              <input value={displayNameDraft} maxLength={12} onChange={(event) => setDisplayNameDraft(event.target.value)} />
            </label>
            <button className="primary-button" type="button" onClick={saveDisplayName}>
              更新昵称
            </button>
            <div className="waiting-room-meta">
              <span>房主：座位 {room.hostSeatIndex + 1}</span>
              <span>当前人数：{room.seats.filter((seat) => seat.guestId).length}/4</span>
              <span>机器人速度：{isFastMode ? "快进" : "正常"}</span>
            </div>
          </article>
        </section>
      ) : null}

      {gameView && game && tableModel ? (
        <section className={`table-layout compact-game-layout ${game.settlement ? "is-settlement" : ""}`}>
          <div className="table-status-strip">
            <span>房间 {room.roomId}</span>
            <span>{tableModel.center.statusLabel}</span>
            <span>{canDiscard ? "轮到你出牌" : `轮到 ${tableModel.center.turnLabel}`}</span>
          </div>

          <div className="table-stage game-table-surface">
            <section className="table-upper-grid">
              <div className="table-top-row">
                <aside className={`game-hud-panel hud-menu ${menuOpen ? "open" : ""}`}>
                  <div className="hud-menu-row">
                    <button className="hud-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)}>
                      {menuOpen ? "收起" : "菜单"}
                    </button>
                    <button
                      aria-label="退出房间"
                      className="secondary-button hud-leave-button hud-icon-button"
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        leaveRoom();
                      }}
                    >
                      <span aria-hidden="true" className="hud-icon-chevron" />
                      <span className="hud-icon-label">退出</span>
                    </button>
                  </div>
                  {menuOpen ? (
                    <div className="hud-menu-sheet">
                      <span>房间 {room.roomId}</span>
                      <span>{session?.displayName ?? "游客"}</span>
                    </div>
                  ) : null}
                </aside>

                <SeatZone seat={tableModel.opponents.top} />

                <aside className="game-hud-panel hud-status">
                  <span>{connectionStatus === "connected" ? "在线" : "重连"}</span>
                  <span>{isFastMode ? "快进" : "正常"}</span>
                  <span>{tableModel.center.wallCount} 张</span>
                </aside>
              </div>

              <div className="table-middle-grid">
                <SeatZone seat={tableModel.opponents.left} />

                <article className="table-center-zone">
                  <div className="dice-pair" aria-label="最近骰点">
                    <DiceFace value={tableModel.center.diceRoll?.first ?? 0} />
                    <DiceFace value={tableModel.center.diceRoll?.second ?? 0} />
                  </div>
                  <div className="center-meta-list">
                    <span>{tableModel.center.statusLabel} · {tableModel.center.turnLabel}</span>
                  </div>
                  <div className="center-focus-card">
                    {tableModel.center.lastDiscard ? (
                      <TileToken tile={tableModel.center.lastDiscard} variant="compact" />
                    ) : (
                      <strong>待出牌</strong>
                    )}
                  </div>
                </article>

                <SeatZone seat={tableModel.opponents.right} />
              </div>
            </section>

            <section className="table-lower-zone">
              {game.settlement ? (
                <>
                  <div className="panel-heading compact-heading">
                    <h2>结算</h2>
                    <span>{game.settlement.reason}</span>
                  </div>
                  <div className="settlement-grid compact-settlement-grid">
                    {game.settlement.items.map((item) => (
                      <div className="settlement-item" key={item.seatIndex}>
                        <strong>{item.displayName ?? `座位 ${item.seatIndex + 1}`}</strong>
                        <span>{item.reason}</span>
                        <span>{item.scoreDelta > 0 ? `+${item.scoreDelta}` : item.scoreDelta}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <article className="action-rail">
                    <div className="action-row compact-action-row">
                      {tableModel.availableActions.length > 0 ? (
                        tableModel.availableActions.map((action) => (
                          <button className="secondary-button" key={action} type="button" onClick={() => gameAction(action)}>
                            {translateAction(action)}
                          </button>
                        ))
                      ) : (
                        <span className="action-rail-hint">等待其他玩家</span>
                      )}
                    </div>
                  </article>

                  <article className="self-zone">
                    <div className="self-summary">
                      <div className="self-summary-main">
                        <strong>{tableModel.self.displayName}</strong>
                        <span>座位 {tableModel.self.seatIndex + 1} · 手牌 {baseHand.length + (drawnTile ? 1 : 0)}</span>
                      </div>
                      <div className="self-summary-meta">
                        <span>{tableModel.self.playerType === "bot" ? "机器人" : "真人"}</span>
                        <span>{tableModel.self.online ? "在线" : "重连中"}</span>
                        <span>手牌 {baseHand.length + (drawnTile ? 1 : 0)}</span>
                      </div>
                    </div>

                    <MeldStrip melds={tableModel.self.melds} />

                    <div className={`hand-stage hand-stage-flat ${drawnTile ? "with-drawn-tile" : ""}`}>
                      <div className="hand-grid hand-grid-flat" style={{ gridTemplateColumns: `repeat(${Math.max(baseHand.length, 1)}, minmax(0, 1fr))` }}>
                        {baseHand.map((tile) => (
                          <button className="tile-button" disabled={!canDiscard} key={tile.id} type="button" onClick={() => discardTile(tile.id)}>
                            <TileToken tile={tile} />
                          </button>
                        ))}
                      </div>
                      {drawnTile ? (
                        <div className="drawn-tile-slot">
                          <span className="drawn-tile-label">新摸</span>
                          <button className="tile-button drawn-tile-button" disabled={!canDiscard} type="button" onClick={() => discardTile(drawnTile.id)}>
                            <TileToken tile={drawnTile} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                </>
              )}
            </section>
          </div>
        </section>
      ) : null}

      {error ? <div className="feedback error">{error}</div> : null}
    </main>
  );
}

function translateAction(action: string): string {
  switch (action) {
    case "hu":
      return "胡";
    case "pong":
      return "碰";
    case "kong":
      return "杠";
    case "pass":
      return "过";
    default:
      return action;
  }
}

function translateMeld(type: string): string {
  switch (type) {
    case "pong":
      return "碰";
    case "ming-kong":
      return "明杠";
    default:
      return type;
  }
}

function SeatZone({ seat }: { seat: TableSeatRenderModel }) {
  return (
    <article className={`table-seat-zone ${seat.position} ${seat.isActive ? "active" : ""}`}>
      <div className="seat-identity">
        <span className={`seat-avatar ${seat.playerType === "bot" ? "bot" : ""}`}>{getSeatAvatar(seat.displayName)}</span>
        <div className="seat-badges">
          {seat.playerType === "bot" ? <span>BOT</span> : null}
          <span>{seat.online ? "在线" : "重连"}</span>
          <span>{seat.handCount}</span>
        </div>
      </div>

      <div className={`seat-backs ${seat.position}`}>
        {getBackTileCount(seat.handCount).map((index) => (
          <span className="seat-back-tile" key={`${seat.seatIndex}-${index}`} />
        ))}
      </div>

      <MeldStrip melds={seat.melds} />

      <div className={`discard-matrix ${seat.discardDensity}`}>
        {seat.discards.length > 0 ? (
          seat.discards.map((tile) => <TileToken key={tile.id} tile={tile} variant="mini" />)
        ) : (
          <span className="discard-placeholder">未出</span>
        )}
      </div>
    </article>
  );
}

function MeldStrip({ melds }: { melds: Meld[] }) {
  if (melds.length === 0) {
    return null;
  }

  return (
    <div className="meld-strip">
      {melds.map((meld, index) => (
        <div className="meld-group" key={`${meld.type}-${meld.tileCode}-${index}`}>
          <span className="meld-label">{translateMeld(meld.type)}</span>
          <div className="meld-tiles">
            {meld.tiles.map((tile) => (
              <TileToken key={tile.id} tile={tile} variant="mini" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiceFace({ value }: { value: number }) {
  const dots = getDicePipMap(value);

  return (
    <div className="dice-face" data-empty={value === 0 ? "true" : "false"}>
      {dots.map((active, index) => (
        <span className={`dice-pip ${active ? "active" : ""}`} key={`${value}-${index}`} />
      ))}
    </div>
  );
}

function TileToken({ tile, variant = "full" }: { tile: Tile; variant?: "full" | "compact" | "mini" }) {
  const glyph = getMahjongGlyph(tile);
  const assetUrl = getTileAssetUrl(tile);

  if (variant === "full") {
    return (
      <span className={`emoji-tile ${getTileTone(tile.suit)}`}>
        {assetUrl ? <img alt={formatTileText(tile)} className="emoji-tile-image" src={assetUrl} /> : <span className="emoji-tile-glyph">{glyph}</span>}
        <span className="emoji-tile-label">{formatTileText(tile)}</span>
      </span>
    );
  }

  const tone = getTileTone(tile.suit);
  return (
    <span className={`tile-token ${variant} ${tone}`}>
      <span className="tile-suit">{glyph}</span>
      {variant === "mini" ? null : <strong>{formatTileText(tile)}</strong>}
    </span>
  );
}

function formatTileText(tile: Tile): string {
  return `${getSuitLabel(tile.suit)}${getRankLabel(tile)}`;
}

function getSuitLabel(suit: TileSuit): string {
  switch (suit) {
    case "wan":
      return "万";
    case "tong":
      return "筒";
    case "tiao":
      return "条";
    case "wind":
      return "风";
    case "dragon":
      return "箭";
  }
}

function getRankLabel(tile: Tile): string {
  if (tile.suit === "wind") {
    return ["东", "南", "西", "北"][tile.rank - 1] ?? String(tile.rank);
  }
  if (tile.suit === "dragon") {
    return ["中", "发", "白"][tile.rank - 1] ?? String(tile.rank);
  }
  return String(tile.rank);
}

function getTileTone(suit: TileSuit): string {
  switch (suit) {
    case "wan":
      return "tone-coral";
    case "tong":
      return "tone-cyan";
    case "tiao":
      return "tone-lime";
    case "wind":
      return "tone-sand";
    case "dragon":
      return "tone-rose";
  }
}

function getMahjongGlyph(tile: Tile): string {
  if (tile.suit === "wind") {
    return ["🀀", "🀁", "🀂", "🀃"][tile.rank - 1] ?? "🀫";
  }
  if (tile.suit === "dragon") {
    return ["🀄", "🀅", "🀆"][tile.rank - 1] ?? "🀫";
  }
  if (tile.suit === "wan") {
    return ["🀇", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍", "🀎", "🀏"][tile.rank - 1] ?? "🀫";
  }
  if (tile.suit === "tiao") {
    return ["🀐", "🀑", "🀒", "🀓", "🀔", "🀕", "🀖", "🀗", "🀘"][tile.rank - 1] ?? "🀫";
  }
  return ["🀙", "🀚", "🀛", "🀜", "🀝", "🀞", "🀟", "🀠", "🀡"][tile.rank - 1] ?? "🀫";
}

function getDicePipMap(value: number): boolean[] {
  const patterns: Record<number, boolean[]> = {
    1: [false, false, false, false, true, false, false, false, false],
    2: [true, false, false, false, false, false, false, false, true],
    3: [true, false, false, false, true, false, false, false, true],
    4: [true, false, true, false, false, false, true, false, true],
    5: [true, false, true, false, true, false, true, false, true],
    6: [true, false, true, true, false, true, true, false, true]
  };

  return patterns[value] ?? new Array(9).fill(false);
}

function getSeatAvatar(displayName: string): string {
  return displayName.trim().slice(0, 1) || "麻";
}

function getBackTileCount(handCount: number): number[] {
  return Array.from({ length: Math.max(3, Math.min(6, Math.ceil(handCount / 3))) }, (_, index) => index);
}
