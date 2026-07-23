import { HomeContent } from './home-content';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Server component — the health call runs on the Next server, so the API
 * hostname never reaches the browser. Client-side calls go through the
 * same-origin /api/v1 rewrite (next.config.mjs).
 *
 * Design-kit components are client-side (hooks), so the fetched data is handed
 * to a Client Component for rendering — the split App Router pattern.
 */
async function getApiHealth(): Promise<'up' | 'down'> {
  try {
    const res = await fetch(`${API_URL}/api/v1/health`, { cache: 'no-store' });
    const body = (await res.json()) as { status?: string };
    return body.status === 'ok' ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

export default async function Home() {
  return <HomeContent health={await getApiHealth()} />;
}
