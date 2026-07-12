/**
 * The IN_APP channel writes to the host application's notification feed, whose
 * schema/entity belongs to the host — not this library. Rather than importing an
 * app entity (which would couple the lib to one app), the host provides an
 * implementation of this sink under the {@link IN_APP_SINK} token and the
 * library's `InAppProvider` delegates to it.
 *
 * When no sink is registered, the IN_APP channel returns an honest failure
 * (never a fake success) — matching the repo's no-mock-data rule.
 */
export interface InAppMessage {
  /** Recipient user id. */
  userId: string;
  /** Host-defined notification type key (the host maps it to its own enum). */
  type?: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown> | null;
}

export interface InAppSink {
  /** Persist an in-app notification; returns the created record id when available. */
  deliver(message: InAppMessage): Promise<string | void>;
}

/** DI token the host binds to its {@link InAppSink} implementation. */
export const IN_APP_SINK = 'IN_APP_SINK';
