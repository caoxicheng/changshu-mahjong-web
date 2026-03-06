import { create } from "zustand";
import type { ClaimAction, GameSnapshot, GuestSession, RoomViewModel, ServerEvent } from "@changshu-mahjong/shared";

const STORAGE_KEY = "changshu-mahjong-session";
const WS_URL = "ws://localhost:3001/ws";

interface PersistedSession {
  guestId: string;
  displayName: string;
  reconnectToken: string;
  roomId?: string | null;
}

interface AppState {
  session: GuestSession | null;
  room: RoomViewModel | null;
  game: GameSnapshot | null;
  socket: WebSocket | null;
  status: "idle" | "connecting" | "connected" | "disconnected";
  error: string | null;
  displayNameDraft: string;
  roomCodeDraft: string;
  connect: () => void;
  reconnect: () => void;
  setDisplayNameDraft: (value: string) => void;
  setRoomCodeDraft: (value: string) => void;
  saveDisplayName: () => void;
  createRoom: () => void;
  joinRoom: () => void;
  leaveRoom: () => void;
  addBot: () => void;
  fillBots: () => void;
  clearBots: () => void;
  resetRoom: () => void;
  rematch: () => void;
  toggleFastMode: (enabled: boolean) => void;
  startRoom: () => void;
  discardTile: (tileId: string) => void;
  gameAction: (action: ClaimAction) => void;
}

function loadPersistedSession(): PersistedSession | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

function persistSession(session: GuestSession | null, roomId?: string | null): void {
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      guestId: session.guestId,
      displayName: session.displayName,
      reconnectToken: session.reconnectToken,
      roomId: roomId ?? null
    } satisfies PersistedSession)
  );
}

export const useAppStore = create<AppState>((set, get) => ({
  session: null,
  room: null,
  game: null,
  socket: null,
  status: "idle",
  error: null,
  displayNameDraft: loadPersistedSession()?.displayName ?? "",
  roomCodeDraft: "",
  connect: () => {
    const existingSocket = get().socket;
    if (existingSocket && (existingSocket.readyState === WebSocket.OPEN || existingSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    set({ status: "connecting", error: null });
    const persisted = loadPersistedSession();
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      set({ status: "connected", socket });
      if (persisted?.guestId && persisted.reconnectToken) {
        socket.send(
          JSON.stringify({
            type: "session.resume",
            payload: {
              guestId: persisted.guestId,
              reconnectToken: persisted.reconnectToken,
              roomId: persisted.roomId ?? undefined
            }
          })
        );
        return;
      }

      socket.send(
        JSON.stringify({
          type: "session.init",
          payload: {
            displayName: get().displayNameDraft || undefined
          }
        })
      );
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerEvent;
      if (message.type === "session.ready") {
        const session = message.payload;
        const roomId = get().room?.roomId ?? persisted?.roomId ?? null;
        persistSession(session, roomId);
        set({
          session,
          displayNameDraft: session.displayName,
          error: null
        });
        return;
      }

      if (message.type === "session.error") {
        set({ error: message.payload.message });
        if (message.payload.code === "resume_denied") {
          window.localStorage.removeItem(STORAGE_KEY);
          socket.send(
            JSON.stringify({
              type: "session.init",
              payload: {
                displayName: get().displayNameDraft || undefined
              }
            })
          );
        }
        return;
      }

      if (message.type === "room.snapshot") {
        persistSession(get().session, message.payload.roomId);
        set({
          room: message.payload,
          game: message.payload.status === "waiting" ? null : get().game,
          error: null
        });
        return;
      }

      if (message.type === "game.snapshot") {
        set({
          game: message.payload,
          error: null
        });
        return;
      }
    };

    socket.onclose = () => {
      set({ status: "disconnected", socket: null });
      window.setTimeout(() => {
        get().reconnect();
      }, 1500);
    };

    socket.onerror = () => {
      set({ error: "连接服务器失败。", status: "disconnected" });
    };

    set({ socket });
  },
  reconnect: () => {
    set({ socket: null });
    get().connect();
  },
  setDisplayNameDraft: (value) => set({ displayNameDraft: value }),
  setRoomCodeDraft: (value) => set({ roomCodeDraft: value }),
  saveDisplayName: () => {
    const socket = get().socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const session = get().session;
    socket.send(
      JSON.stringify({
        type: "session.init",
        payload: {
          guestId: session?.guestId,
          displayName: get().displayNameDraft
        }
      })
    );
  },
  createRoom: () => {
    const socket = get().socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.create",
        payload: {
          displayName: get().displayNameDraft
        }
      })
    );
  },
  joinRoom: () => {
    const socket = get().socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.join",
        payload: {
          roomId: get().roomCodeDraft.trim(),
          displayName: get().displayNameDraft
        }
      })
    );
  },
  leaveRoom: () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.leave",
        payload: {
          roomId: room.roomId
        }
      })
    );
    set({
      room: null,
      game: null,
      roomCodeDraft: ""
    });
    persistSession(get().session, null);
  },
  addBot: () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.addBot",
        payload: {
          roomId: room.roomId
        }
      })
    );
  },
  fillBots: () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.fillBots",
        payload: {
          roomId: room.roomId
        }
      })
    );
  },
  clearBots: () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.clearBots",
        payload: {
          roomId: room.roomId
        }
      })
    );
  },
  resetRoom: () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.reset",
        payload: {
          roomId: room.roomId
        }
      })
    );
  },
  rematch: () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.rematch",
        payload: {
          roomId: room.roomId
        }
      })
    );
  },
  toggleFastMode: (enabled) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.toggleFastMode",
        payload: {
          roomId: room.roomId,
          enabled
        }
      })
    );
  },
  startRoom: () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "room.start",
        payload: {
          roomId: room.roomId
        }
      })
    );
  },
  discardTile: (tileId) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "game.discard",
        payload: {
          roomId: room.roomId,
          tileId
        }
      })
    );
  },
  gameAction: (action) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || socket.readyState !== WebSocket.OPEN || !room) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "game.action",
        payload: {
          roomId: room.roomId,
          action
        }
      })
    );
  }
}));
