import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * The emit surface features inject. Feature code never touches socket.io
 * directly — it says "tell this user this happened" and the gateway/adapter
 * decide which sockets (on which instance) receive it.
 */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  /** Called once by the gateway when the socket.io server is up. */
  bind(server: Server): void {
    this.server = server;
  }

  /** Room name for one user's sockets (all their devices/tabs). */
  static userRoom(userId: string): string {
    return `user:${userId}`;
  }

  /**
   * Emit an event to every connected socket of one user (across instances when
   * the Redis adapter is active). Returns false when the server isn't up yet —
   * callers treat realtime as best-effort, never a failure path.
   */
  emitToUser(userId: string, event: string, payload: unknown): boolean {
    if (!this.server) return false;
    this.server.to(RealtimeService.userRoom(userId)).emit(event, payload);
    return true;
  }

  /** Broadcast to every authenticated socket (system-wide announcements). */
  emitToAll(event: string, payload: unknown): boolean {
    if (!this.server) return false;
    this.server.emit(event, payload);
    return true;
  }
}
