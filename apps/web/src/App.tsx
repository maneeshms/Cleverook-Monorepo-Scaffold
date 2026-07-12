import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, isAuthenticated, Task } from './api';

export default function App() {
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(isAuthenticated());
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .health()
      .then((h) => setApiUp(h.status === 'ok'))
      .catch(() => setApiUp(false));
  }, []);

  return (
    <main className="shell">
      <header>
        <h1>ClevScaffold</h1>
        <span className={`badge ${apiUp ? 'up' : 'down'}`}>
          API {apiUp === null ? '…' : apiUp ? 'up' : 'down'}
        </span>
      </header>
      {error && <p className="error">{error}</p>}
      {authed ? (
        <TasksPanel
          onError={setError}
          onLogout={() => {
            void api.logout();
            setAuthed(false);
          }}
        />
      ) : (
        <AuthPanel
          onError={setError}
          onAuthed={() => {
            setError('');
            setAuthed(true);
          }}
        />
      )}
    </main>
  );
}

function AuthPanel({ onAuthed, onError }: { onAuthed: () => void; onError: (m: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    try {
      if (mode === 'login') await api.login(email, password);
      else await api.register(email, password, String(form.get('displayName') || '') || undefined);
      onAuthed();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
      {mode === 'register' && <input name="displayName" placeholder="Display name (optional)" />}
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required minLength={8} />
      <button type="submit">{mode === 'login' ? 'Sign in' : 'Register'}</button>
      <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}

function TasksPanel({ onLogout, onError }: { onLogout: () => void; onError: (m: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');

  const refresh = useCallback(() => {
    api
      .listTasks()
      .then((page) => setTasks(page.data))
      .catch((err) => onError(err.message));
  }, [onError]);

  useEffect(refresh, [refresh]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createTask(title.trim());
      setTitle('');
      refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const cycle = (task: Task) => {
    const next = task.status === 'TODO' ? 'IN_PROGRESS' : task.status === 'IN_PROGRESS' ? 'DONE' : 'TODO';
    api.setTaskStatus(task.id, next).then(refresh).catch((err) => onError(err.message));
  };

  return (
    <section className="card">
      <div className="row">
        <h2>My tasks</h2>
        <button className="link" onClick={onLogout}>
          Sign out
        </button>
      </div>
      <form className="row" onSubmit={create}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task title" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {tasks.map((task) => (
          <li key={task.id} className="row">
            <button className={`status ${task.status}`} onClick={() => cycle(task)}>
              {task.status}
            </button>
            <span>{task.title}</span>
            <button className="link" onClick={() => api.deleteTask(task.id).then(refresh)}>
              ✕
            </button>
          </li>
        ))}
        {tasks.length === 0 && <li className="muted">No tasks yet — add one above.</li>}
      </ul>
    </section>
  );
}
