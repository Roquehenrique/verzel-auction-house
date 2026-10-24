"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toast";
import { SOCKET_URL } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
});

// One Socket.IO connection per tab. It reconnects with the new token whenever
// the user logs in or out (anonymous visitors still get public events).
export function SocketProvider({ children }: { children: ReactNode }) {
  const { status, token, logout } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);

  // Created without connecting (no side effect during render); the effect
  // below connects it and closes it when the session changes.
  const socket = useMemo(
    () =>
      status === "loading"
        ? null
        : io(SOCKET_URL, {
            auth: token ? { token } : {},
            transports: ["websocket", "polling"],
            autoConnect: false,
            // Always a dedicated connection per session (never a cached one
            // that could carry the previous session's auth).
            forceNew: true,
          }),
    [status, token],
  );

  useEffect(() => {
    if (!socket) return;
    const instance = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (error: Error) => {
      if (error.message === "UNAUTHORIZED") logout(); // expired session
    };

    // Private notifications (only arrive for the logged-in user).
    const onWalletUpdated = () =>
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    const onOutbid = (event: { title: string; currentBidCents: number }) => {
      toast.show({
        tone: "warning",
        title: "Você foi superado!",
        description: `${event.title}: novo lance de ${formatBRL(event.currentBidCents)}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["my-bids"] });
    };
    const onWon = (event: { title: string; amountCents: number }) => {
      toast.show({
        tone: "success",
        title: "Você arrematou!",
        description: `${event.title} por ${formatBRL(event.amountCents)}. O comprovante está em Meus arremates.`,
      });
      queryClient.invalidateQueries({ queryKey: ["my-bids"] });
    };

    // The lot I was leading was cancelled: my reserved amount was refunded.
    const onLotCancelled = (event: { title: string; reason: string | null; refundedCents: number }) => {
      toast.show({
        tone: "info",
        title: "Lote cancelado pelo leiloeiro",
        description: `${event.title}: ${formatBRL(event.refundedCents)} voltaram ao seu saldo disponível.${
          event.reason ? ` Motivo: ${event.reason}` : ""
        }`,
      });
      queryClient.invalidateQueries({ queryKey: ["my-bids"] });
    };

    instance.on("connect", onConnect);
    instance.on("disconnect", onDisconnect);
    instance.on("connect_error", onConnectError);
    instance.on("wallet:updated", onWalletUpdated);
    instance.on("user:outbid", onOutbid);
    instance.on("user:won", onWon);
    instance.on("user:lot-cancelled", onLotCancelled);
    instance.connect();

    return () => {
      instance.off("connect", onConnect);
      instance.off("disconnect", onDisconnect);
      instance.off("connect_error", onConnectError);
      instance.off("wallet:updated", onWalletUpdated);
      instance.off("user:outbid", onOutbid);
      instance.off("user:won", onWon);
      instance.off("user:lot-cancelled", onLotCancelled);
      instance.disconnect(); // fires "disconnect" -> connected = false
    };
  }, [socket, logout, queryClient, toast]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  // Like useAuth: while THIS component hydrates, report what the server
  // rendered (disconnected). React does not patch attribute mismatches during
  // hydration, so a value that changed earlier would stay stale in the DOM.
  const hydrated = useHydrated();
  return hydrated ? context : { ...context, connected: false };
}

// Joins a room while the component is mounted and joins again after every
// reconnection (rooms are lost when the connection drops). `onRejoin` lets the
// page reload its state, since events sent while offline are not replayed.
export function useSocketRoom(
  join: { event: string; payload?: unknown } | null,
  leave: { event: string; payload?: unknown } | null,
  onRejoin?: () => void,
) {
  const { socket } = useSocket();
  const onRejoinRef = useRef(onRejoin);
  useEffect(() => {
    onRejoinRef.current = onRejoin;
  });
  const joinKey = JSON.stringify(join);
  const leaveKey = JSON.stringify(leave);

  useEffect(() => {
    if (!socket || !join) return;
    let firstConnection = true;
    const doJoin = () => {
      socket.emit(join.event, join.payload);
      if (!firstConnection) onRejoinRef.current?.();
      firstConnection = false;
    };
    if (socket.connected) doJoin();
    socket.on("connect", doJoin);
    return () => {
      socket.off("connect", doJoin);
      if (leave && socket.connected) socket.emit(leave.event, leave.payload);
    };
    // join/leave are compared by value (joinKey/leaveKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, joinKey, leaveKey]);
}

// Subscribes to a socket event with the latest handler.
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
