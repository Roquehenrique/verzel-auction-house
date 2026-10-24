import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AuthUser, JwtPayload } from '../auth/auth.types.js';

// Rooms
//   lot:{id}   everyone watching a lot room (public)
//   showcase   everyone on the showcase page (public)
//   user:{id}  private channel of a logged-in user (joined automatically)
export const lotRoom = (lotId: string) => `lot:${lotId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const SHOWCASE_ROOM = 'showcase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SocketData {
  user: AuthUser | null;
}
type AuctionSocket = Socket<any, any, any, SocketData>;

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwt: JwtService) {}

  // Authentication happens in the handshake. No token = anonymous viewer (the
  // showcase and lot rooms are public). An invalid/expired token is refused, so
  // the client knows it must log in again instead of silently missing its
  // private notifications.
  afterInit(server: Server) {
    server.use((socket: AuctionSocket, next) => {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== 'string' || token === '') {
        socket.data.user = null;
        return next();
      }
      this.jwt
        .verifyAsync<JwtPayload>(token)
        .then((payload) => {
          socket.data.user = { id: payload.sub, role: payload.role };
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });
  }

  async handleConnection(socket: AuctionSocket) {
    const user = socket.data.user;
    if (user) await socket.join(userRoom(user.id));
  }

  @SubscribeMessage('lot:join')
  async joinLot(
    @ConnectedSocket() socket: AuctionSocket,
    @MessageBody() body: { lotId?: unknown },
  ) {
    const lotId = body?.lotId;
    if (typeof lotId !== 'string' || !UUID.test(lotId)) return { ok: false };
    await socket.join(lotRoom(lotId));
    return { ok: true };
  }

  @SubscribeMessage('lot:leave')
  async leaveLot(
    @ConnectedSocket() socket: AuctionSocket,
    @MessageBody() body: { lotId?: unknown },
  ) {
    if (typeof body?.lotId === 'string')
      await socket.leave(lotRoom(body.lotId));
    return { ok: true };
  }

  @SubscribeMessage('showcase:join')
  async joinShowcase(@ConnectedSocket() socket: AuctionSocket) {
    await socket.join(SHOWCASE_ROOM);
    return { ok: true };
  }

  @SubscribeMessage('showcase:leave')
  async leaveShowcase(@ConnectedSocket() socket: AuctionSocket) {
    await socket.leave(SHOWCASE_ROOM);
    return { ok: true };
  }
}
