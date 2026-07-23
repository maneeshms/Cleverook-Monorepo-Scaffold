/**
 * Reference UI for the Clevrook Design Kit on React Native.
 *
 * Every visual element comes from `@clevrook/native` + theme tokens — no
 * `StyleSheet` colors, font sizes, or radii. The only local styles are layout
 * primitives (`flex`, direction) that carry no design decisions. Mirror this
 * shape when you build real screens; see docs/DESIGN_SYSTEM.md.
 */
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Rubik_400Regular, Rubik_500Medium } from '@expo-google-fonts/rubik';
import { useFonts } from 'expo-font';
import { ThemeProvider } from '@clevrook/theme';
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
} from '@clevrook/native';
import { api, Task } from './src/api';
import { registerForPush, unregisterPush } from './src/push';
import { brandPrimitives } from './src/theme/brand';

export default function App() {
  // The keys registered here ARE the font family names — src/theme/brand.ts maps
  // the kit's `sans`/`body` tokens onto them. Keep the two in sync.
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Rubik_400Regular,
    Rubik_500Medium,
  });

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider primitives={brandPrimitives} mode="light">
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
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
    <Box background="primary" paddingX="md" gap="md" style={styles.shell}>
      <StatusBar style="dark" />
      <Box style={styles.rowBetween}>
        <Text variant="heading-lg">ClevScaffold</Text>
        {apiUp === null ? (
          <Spinner size="sm" />
        ) : (
          <Badge variant={apiUp ? 'success' : 'error'}>API {apiUp ? 'up' : 'down'}</Badge>
        )}
      </Box>

      {error ? (
        <Alert variant="error" onClose={() => setError('')}>
          {error}
        </Alert>
      ) : null}

      {authed === null ? (
        <Spinner size="lg" />
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
    </Box>
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
    <Card title={mode === 'login' ? 'Sign in' : 'Create account'}>
      <Box gap="md">
        {mode === 'register' && (
          <TextInput
            placeholder="Display name (optional)"
            value={displayName}
            onChangeText={setDisplayName}
            fullWidth
          />
        )}
        <TextInput
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          fullWidth
        />
        <TextInput
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          fullWidth
        />
        <Button variant="primary" fullWidth disabled={busy} onPress={submit}>
          {mode === 'login' ? 'Sign in' : 'Register'}
        </Button>
        <Button variant="ghost" onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </Button>
      </Box>
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
    <View style={styles.grow}>
      <Card>
        <Box gap="md">
          <Box style={styles.rowBetween}>
            <Text variant="heading-md">My tasks</Text>
            <Button variant="ghost" size="sm" onPress={onLogout}>
              Sign out
            </Button>
          </Box>

          <Box gap="sm" style={styles.row}>
            <View style={styles.grow}>
              <TextInput
                placeholder="New task title"
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={create}
                fullWidth
              />
            </View>
            <Button onPress={create}>Add</Button>
          </Box>

          <FlatList
            data={tasks}
            keyExtractor={(task) => task.id}
            ListEmptyComponent={
              <EmptyState
                icon="Plus"
                title="No tasks yet"
                description="Add one above to see the list render."
              />
            }
            renderItem={({ item: task }) => (
              <Box gap="sm" paddingY="xs" style={styles.row}>
                <Button variant="outline" size="sm" onPress={() => cycle(task)}>
                  {task.status}
                </Button>
                <Text variant="body-md" style={styles.grow}>
                  {task.title}
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  accessibilityLabel={`Delete ${task.title}`}
                  onPress={() => api.deleteTask(task.id).then(refresh)}
                >
                  <Icon name="X" size="sm" />
                </Button>
              </Box>
            )}
          />
        </Box>
      </Card>
    </View>
  );
}

// Layout only — no colors, font sizes, or radii. Those belong to the design kit.
const styles = StyleSheet.create({
  shell: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 48 : 64,
    paddingBottom: 24,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grow: { flex: 1 },
});
