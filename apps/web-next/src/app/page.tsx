const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Server component — the health call runs on the Next server, so the API
 * hostname never reaches the browser. Client-side calls go through the
 * same-origin /api/v1 rewrite (next.config.mjs).
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
  const health = await getApiHealth();
  return (
    <main className="shell">
      <header>
        <h1>ClevScaffold</h1>
        <span className={`badge ${health}`}>API {health}</span>
      </header>
      <section className="card">
        <h2>Next.js App Router sample</h2>
        <p>
          This page renders on the server and checks the backend&apos;s health endpoint. Client
          requests are proxied same-origin to <code>/api/v1/*</code> — see{' '}
          <code>next.config.mjs</code>.
        </p>
        <p>
          The richer interactive sample (auth + tasks) lives in <code>apps/web</code>; API docs at{' '}
          <code>{'{API}'}/api/docs</code>.
        </p>
      </section>
    </main>
  );
}
