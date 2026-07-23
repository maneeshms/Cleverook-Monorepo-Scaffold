/**
 * Project branding — the ONLY place this app customises the Clevrook Design Kit.
 *
 * The kit ships `defaultPrimitives` (mint/teal `#18BB8E`, Plus Jakarta Sans +
 * Rubik, 8px radius). Spread it and override just what this product changes;
 * semantic and component tokens rebuild from your primitives automatically, so
 * every component picks the change up with no further wiring.
 *
 * Rules:
 *   - Never edit `node_modules/@clevrook/*` — override here instead.
 *   - Never hardcode a hex, font size, or radius in a component — if a token is
 *     missing, add it here (or raise it with the design-kit team).
 *
 * Full override reference: `node_modules/@clevrook/tokens/docs/PROJECT_BRANDING.md`.
 */
import { defaultPrimitives, type PrimitiveTokens } from '@clevrook/tokens';

export const brandPrimitives: PrimitiveTokens = {
  ...defaultPrimitives,
  // Example — replace with this product's palette:
  // colors: {
  //   ...defaultPrimitives.colors,
  //   brand: { ...defaultPrimitives.colors.brand, 500: '#EA580C', 600: '#C2410C' },
  // },
};
