import type { InjectionToken, ModuleMetadata } from '@nestjs/common';

/**
 * Runtime configuration for the realtime (socket.io) library. The host app
 * builds this from its ConfigService and passes it via
 * `RealtimeModule.forRootAsync(...)` — the library never reads `process.env` or
 * app config namespaces itself, which is what keeps it portable.
 */
export interface RealtimeModuleOptions {
  /**
   * HS256 secret used to verify the access JWT presented in the socket.io
   * handshake (`auth: { token }`). Use the SAME secret as the API's access
   * tokens so a logged-in client can connect with the token it already holds.
   */
  accessSecret: string;
  /**
   * When set, the gateway attaches the socket.io Redis adapter (two dedicated
   * pub/sub connections) so `emitToUser` reaches sockets connected to OTHER
   * instances. Unset → default in-memory adapter (single-instance correct) —
   * the same Redis-optional posture as throttling and the email queue.
   */
  redisUrl?: string | null;
}

export const REALTIME_OPTIONS: InjectionToken = Symbol('REALTIME_OPTIONS');

/** Async factory wiring, mirroring the other config-injected libs. */
export interface RealtimeModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: InjectionToken[];
  useFactory: (...args: never[]) => RealtimeModuleOptions | Promise<RealtimeModuleOptions>;
}
