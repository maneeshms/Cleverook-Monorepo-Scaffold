'use client';

/**
 * Reference UI for the Clevrook Design Kit in the App Router.
 *
 * Every visual element comes from `@clevrook/web` + theme tokens — no bespoke
 * CSS, no hardcoded color, font size, or radius. Mirror this shape when you
 * build real screens; see docs/DESIGN_SYSTEM.md.
 */
import { Badge, Box, Card, Text } from '@clevrook/web';

const column = { display: 'flex', flexDirection: 'column' } as const;
const rowBetween = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
} as const;

export function HomeContent({ health }: { health: 'up' | 'down' }) {
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
        <Badge variant={health === 'up' ? 'success' : 'error'}>API {health}</Badge>
      </Box>

      <Card title="Next.js App Router sample">
        <Box gap="md" style={column}>
          <Text variant="body-md" color="secondary">
            This page renders on the server and checks the backend&apos;s health endpoint. Client
            requests are proxied same-origin to <code>/api/v1/*</code> — see{' '}
            <code>next.config.mjs</code>.
          </Text>
          <Text variant="body-md" color="secondary">
            The richer interactive sample (auth + tasks) lives in <code>apps/web</code>; API docs at{' '}
            <code>{'{API}'}/api/docs</code>.
          </Text>
          <Text variant="body-sm" color="tertiary">
            All UI here is built from the Clevrook Design Kit — see docs/DESIGN_SYSTEM.md before
            adding screens.
          </Text>
        </Box>
      </Card>
    </Box>
  );
}
