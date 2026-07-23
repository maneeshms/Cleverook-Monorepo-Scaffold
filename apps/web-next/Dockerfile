# Web-Next (Next.js App Router, standalone output).
# Build context = repo root. Pattern: deps → build → minimal runner (non-root).

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
# .npmrc routes the @clevrook design-kit scope to GitHub Packages; the token is
# mounted as a BuildKit secret so it never lands in an image layer or history.
# Build with:  docker build --secret id=github_token,env=GITHUB_TOKEN …
# pnpm-workspace.yaml marks this directory as its OWN workspace root AND carries
# the transitive `overrides` (sharp, postcss) — pnpm ignores npm's `overrides`
# field, so omitting this file would silently un-pin them.
COPY apps/web-next/package.json apps/web-next/pnpm-lock.yaml apps/web-next/pnpm-workspace.yaml apps/web-next/.npmrc ./
# pnpm ignores credentials in a project .npmrc (see that file), so the token is
# written to the USER-level ~/.npmrc — created and shredded inside a single RUN,
# so it never becomes part of a layer. Both steps run together for the same
# reason: leaving ~/.npmrc behind would bake the token into the image.
RUN --mount=type=secret,id=github_token \
    printf '//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/github_token)" > /root/.npmrc && \
    pnpm install --frozen-lockfile && \
    pnpm audit --audit-level critical --prod; \
    status=$?; rm -f /root/.npmrc; exit $status

# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
# pnpm's node_modules contains symlinks into .pnpm — copy the whole tree so the
# links resolve in this stage.
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web-next/ ./
RUN pnpm run build

# ---- run ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# This runner only executes `node server.js` — the base image's bundled npm CLI
# is never used, yet its vendored deps carry the fixable CVEs Trivy flags. Strip
# it entirely: smaller image, zero npm attack surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3005
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
