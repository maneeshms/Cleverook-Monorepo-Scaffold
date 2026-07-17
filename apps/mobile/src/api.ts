/**
 * Minimal typed API client for the ClevScaffold reference API (React Native).
 *
 * Token handling on native differs from the web sample (apps/web) on purpose:
 * the access token lives in module memory only, while the rotating refresh
 * token is persisted in the OS keychain/keystore via expo-secure-store — the
 * native equivalent of an httpOnly cookie (never AsyncStorage, which is
 * plaintext on disk). On launch, restoreSession() silently rotates the stored
 * refresh token into a fresh pair; on a 401 mid-session the client refreshes
 * once and retries the request.
 *
 * Point EXPO_PUBLIC_API_URL at your API (a device cannot reach "localhost" of
 * your dev machine — use the LAN IP, e.g. http://192.168.1.20:3000).
 */
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  dueDate: string | null;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

let accessToken: string | null = null;

async function storeTokens(pair: TokenPair): Promise<void> {
  accessToken = pair.accessToken;
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, pair.refreshToken);
}

async function clearTokens(): Promise<void> {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined);
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}/api/v1${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    const error = new Error(message ?? `Request failed (${res.status})`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Rotate the stored refresh token into a new pair. Single-flight: concurrent
 *  401s share one refresh call so the rotating token is never double-spent
 *  (reuse of a rotated token is treated as theft by the API and revokes the
 *  whole session family). */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!stored) return false;
    try {
      const pair = await rawRequest<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: stored }),
      });
      await storeTokens(pair);
      return true;
    } catch {
      await clearTokens();
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Request with one silent refresh+retry on 401 (access tokens last 15 min). */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, init);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401 && (await refreshSession())) return rawRequest<T>(path, init);
    throw err;
  }
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  /** Try to resume the previous session from the keychain. */
  restoreSession: (): Promise<boolean> => refreshSession(),

  async login(email: string, password: string): Promise<void> {
    await storeTokens(
      await rawRequest<TokenPair>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    );
  },

  async register(email: string, password: string, displayName?: string): Promise<void> {
    await storeTokens(
      await rawRequest<TokenPair>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      }),
    );
  },

  async logout(): Promise<void> {
    await request<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await clearTokens();
  },

  me: () => request<{ email: string; displayName: string | null }>('/users/me'),

  listTasks: (page = 1) => request<Paginated<Task>>(`/tasks?page=${page}&limit=20`),

  createTask: (title: string) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title }) }),

  setTaskStatus: (id: string, status: Task['status']) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  registerDevice: (token: string, platform: 'ANDROID' | 'IOS' | 'WEB') =>
    request<{ id: string }>('/notifications/devices', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    }),

  unregisterDevice: (token: string) =>
    request<void>('/notifications/devices', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    }),
};
