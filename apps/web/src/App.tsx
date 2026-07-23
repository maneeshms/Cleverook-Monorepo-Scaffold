/**
 * Reference UI for the Clevrook Design Kit.
 *
 * Every visual element here comes from `@clevrook/web` + theme tokens — no
 * bespoke CSS, no hardcoded color, font size, or radius. Plain elements appear
 * only where semantics demand them (`<form>`); layout uses `Box` so spacing
 * stays on the token scale. Mirror this shape when you build real screens; see
 * docs/DESIGN_SYSTEM.md.
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  EmptyState,
  Icon,
  Spinner,
  Text,
  TextInput,
} from '@clevrook/web';
import { api, isAuthenticated, Task } from './api';

const column = { display: 'flex', flexDirection: 'column' } as const;
const row = { display: 'flex', alignItems: 'center' } as const;
const rowBetween = { ...row, justifyContent: 'space-between' } as const;

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
    <Box
      as="main"
      paddingX="lg"
      paddingY="xl"
      gap="lg"
      style={{ ...column, maxWidth: 560, margin: '0 auto' }}
    >
      <Box as="header" style={rowBetween}>
        <Text variant="heading-lg">ClevScaffold</Text>
        {apiUp === null ? (
          <Spinner size="sm" label="Checking API" />
        ) : (
          <Badge variant={apiUp ? 'success' : 'error'}>API {apiUp ? 'up' : 'down'}</Badge>
        )}
      </Box>

      {error && (
        <Alert variant="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

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
    </Box>
  );
}

function AuthPanel({ onAuthed, onError }: { onAuthed: () => void; onError: (m: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setBusy(true);
    try {
      if (mode === 'login') await api.login(email, password);
      else await api.register(email, password, String(form.get('displayName') || '') || undefined);
      onAuthed();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={mode === 'login' ? 'Sign in' : 'Create account'}>
      <form onSubmit={submit}>
        <Box gap="md" style={column}>
          {mode === 'register' && (
            <TextInput name="displayName" placeholder="Display name (optional)" fullWidth />
          )}
          <TextInput name="email" type="email" placeholder="Email" required fullWidth />
          <TextInput
            name="password"
            type="password"
            placeholder="Password"
            required
            minLength={8}
            fullWidth
          />
          <Button type="submit" variant="primary" fullWidth disabled={busy}>
            {mode === 'login' ? 'Sign in' : 'Register'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
          </Button>
        </Box>
      </form>
    </Card>
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

  const create = async (event: FormEvent<HTMLFormElement>) => {
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
    const next =
      task.status === 'TODO' ? 'IN_PROGRESS' : task.status === 'IN_PROGRESS' ? 'DONE' : 'TODO';
    api
      .setTaskStatus(task.id, next)
      .then(refresh)
      .catch((err) => onError(err.message));
  };

  return (
    <Card>
      <Box gap="md" style={column}>
        <Box style={rowBetween}>
          <Text variant="heading-md">My tasks</Text>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Sign out
          </Button>
        </Box>

        <form onSubmit={create}>
          <Box gap="sm" style={row}>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task title"
              fullWidth
            />
            <Button type="submit">Add</Button>
          </Box>
        </form>

        {tasks.length === 0 ? (
          <EmptyState
            icon="Plus"
            title="No tasks yet"
            description="Add one above to see the list render."
          />
        ) : (
          <Box as="ul" gap="sm" style={{ ...column, listStyle: 'none', padding: 0, margin: 0 }}>
            {tasks.map((task) => (
              <Box as="li" key={task.id} gap="sm" style={row}>
                <Button variant="outline" size="sm" onClick={() => cycle(task)}>
                  {task.status}
                </Button>
                <Text variant="body-md" style={{ flex: 1 }}>
                  {task.title}
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${task.title}`}
                  onClick={() => api.deleteTask(task.id).then(refresh)}
                >
                  <Icon name="X" size="sm" />
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Card>
  );
}
