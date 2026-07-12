/**
 * Minimal typed API client for the ClevScaffold reference API.
 *
 * Tokens live in module memory only — NEVER localStorage/sessionStorage (XSS
 * exfiltration surface). A page reload therefore requires a fresh login; for a
 * production app prefer a BFF/cookie session or silent refresh — see
 * docs/agents/frontend.md.
 */

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

let tokens: TokenPair | null = null;

export const isAuthenticated = () => tokens !== null;
export const clearTokens = () => {
  tokens = null;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;

  const res = await fetch(`/api/v1${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(message ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  async login(email: string, password: string): Promise<void> {
    tokens = await request<TokenPair>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(email: string, password: string, displayName?: string): Promise<void> {
    tokens = await request<TokenPair>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
  },

  async logout(): Promise<void> {
    await request<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
    tokens = null;
  },

  me: () => request<{ email: string; displayName: string | null }>('/users/me'),

  listTasks: (page = 1) => request<Paginated<Task>>(`/tasks?page=${page}&limit=20`),

  createTask: (title: string) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title }) }),

  setTaskStatus: (id: string, status: Task['status']) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};
