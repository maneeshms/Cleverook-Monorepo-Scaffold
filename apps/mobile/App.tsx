import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, Task } from './src/api';
import { registerForPush, unregisterPush } from './src/push';

export default function App() {
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null); // null = restoring
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .health()
      .then((h) => setApiUp(h.status === 'ok'))
      .catch(() => setApiUp(false));
    api.restoreSession().then((ok) => {
      setAuthed(ok);
      if (ok) void registerForPush();
    });
  }, []);

  return (
    <View style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>ClevScaffold</Text>
        <View style={[styles.badge, apiUp ? styles.badgeUp : styles.badgeDown]}>
          <Text style={styles.badgeText}>API {apiUp === null ? '…' : apiUp ? 'up' : 'down'}</Text>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {authed === null ? (
        <ActivityIndicator style={styles.card} />
      ) : authed ? (
        <TasksPanel
          onError={setError}
          onLogout={async () => {
            await unregisterPush();
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
            void registerForPush();
          }}
        />
      )}
    </View>
  );
}

function AuthPanel({ onAuthed, onError }: { onAuthed: () => void; onError: (m: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'login') await api.login(email.trim(), password);
      else await api.register(email.trim(), password, displayName.trim() || undefined);
      onAuthed();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
      {mode === 'register' && (
        <TextInput
          style={styles.input}
          placeholder="Display name (optional)"
          value={displayName}
          onChangeText={setDisplayName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.button} disabled={busy} onPress={submit}>
        <Text style={styles.buttonText}>
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Register'}
        </Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
        <Text style={styles.link}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </Text>
      </Pressable>
    </View>
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

  const create = async () => {
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
    <View style={[styles.card, styles.grow]}>
      <View style={styles.row}>
        <Text style={styles.h2}>My tasks</Text>
        <Pressable onPress={onLogout}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.grow]}
          placeholder="New task title"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={create}
        />
        <Pressable style={styles.button} onPress={create}>
          <Text style={styles.buttonText}>Add</Text>
        </Pressable>
      </View>
      <FlatList
        data={tasks}
        keyExtractor={(task) => task.id}
        ListEmptyComponent={<Text style={styles.muted}>No tasks yet — add one above.</Text>}
        renderItem={({ item: task }) => (
          <View style={styles.row}>
            <Pressable style={styles.status} onPress={() => cycle(task)}>
              <Text style={styles.statusText}>{task.status}</Text>
            </Pressable>
            <Text style={styles.grow}>{task.title}</Text>
            <Pressable onPress={() => api.deleteTask(task.id).then(refresh)}>
              <Text style={styles.link}>✕</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#f4f5f7',
    paddingTop: Platform.OS === 'android' ? 48 : 64,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700' },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeUp: { backgroundColor: '#d1f7dd' },
  badgeDown: { backgroundColor: '#fde2e2' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  grow: { flex: 1 },
  h2: { fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d5d9df',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { color: '#1f6feb', fontWeight: '500' },
  status: { borderRadius: 6, backgroundColor: '#eef1f5', paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  muted: { color: '#7a828c' },
  error: { color: '#c0392b' },
});
