/**
 * Project branding — the ONLY place this app customises the Clevrook Design Kit.
 *
 * The kit ships `defaultPrimitives` (mint/teal `#18BB8E`, Plus Jakarta Sans +
 * Rubik, 8px radius). Spread it and override just what this product changes;
 * semantic and component tokens rebuild from your primitives automatically.
 *
 * ── Why this file overrides fontFamily and the web ones don't ────────────────
 * The kit's `fontFamily` primitives are CSS font stacks
 * (`'"Plus Jakarta Sans", system-ui, …'`). React Native does not understand font
 * stacks — `fontFamily` must be exactly one registered face name, and an
 * unrecognised value silently falls back to the system font. So on native we map
 * each family to the face registered by `useFonts` in App.tsx; the names must
 * match those keys exactly.
 *
 * Known limitation: the token shape carries one family per category, so native
 * cannot pick a different face per weight. `display-*` (bold in the tokens)
 * renders with the SemiBold face. Register and map an extra family here if a
 * product needs true bold display text.
 *
 * Rules:
 *   - Never edit `node_modules/@clevrook/*` — override here instead.
 *   - Never hardcode a hex, font size, or radius in a component.
 *
 * Full override reference: `node_modules/@clevrook/tokens/docs/PROJECT_BRANDING.md`.
 */
import { defaultPrimitives, type PrimitiveTokens } from '@clevrook/tokens';

export const brandPrimitives: PrimitiveTokens = {
  ...defaultPrimitives,
  typography: {
    ...defaultPrimitives.typography,
    fontFamily: {
      ...defaultPrimitives.typography.fontFamily,
      // display + heading variants
      sans: 'PlusJakartaSans_600SemiBold',
      // body + label + caption variants
      body: 'Rubik_400Regular',
    },
  },
  // Example — replace with this product's palette:
  // colors: {
  //   ...defaultPrimitives.colors,
  //   brand: { ...defaultPrimitives.colors.brand, 500: '#EA580C', 600: '#C2410C' },
  // },
};
