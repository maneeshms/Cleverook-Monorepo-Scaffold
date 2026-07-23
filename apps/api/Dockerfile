# ---- builder ----
# Installs the whole workspace (libs compile into the app's dist), builds the app,
# then emits a lean production manifest listing only this app's external deps.
FROM node:22-alpine AS builder
WORKDIR /app
# corepack activates the pnpm version pinned in package.json#packageManager, so
# the image builds with exactly the pnpm the lockfile was written by.
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
# Block the build if any CRITICAL vulnerability is found in production deps.
RUN pnpm audit --audit-level critical --prod
RUN pnpm exec nx build api
RUN node scripts/docker-manifest.mjs apps/api dist/apps/api/deploy-package.json

# ---- production ----
# Ships only api's own dependency closure (no unused libs).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Layered config: point the loader at this app's config directory.
ENV CONFIG_DIR=/app/config
# Harden the base image's bundled npm CLI: its vendored deps (@sigstore/core,
# brace-expansion, ip-address, …) trail the fixable CRITICAL/HIGH advisories
# Trivy flags. Nothing here uses npm any more — installs and the migration step
# both run through pnpm — but the base image still ships npm, so Trivy still
# scans it. Upgrading to the current npm 11.x (patched vendored deps) clears
# those findings. Pinned to the 11 line because npm 12 requires node >=22.22.2,
# newer than node:22-alpine ships; 11.x needs only >=22.9.0. Self-heals within
# the 11 line on rebuild, matching the rolling base image + daily image scan.
RUN npm install -g npm@11 && npm cache clean --force
RUN corepack enable
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/dist/apps/api/deploy-package.json ./package.json
# deploy-package.json is a generated flat manifest with no lockfile (it lists
# only this app's external closure), so there is nothing to freeze against here.
RUN pnpm install --prod --no-optional && pnpm store prune
COPY --from=builder /app/dist/apps/api/ ./dist/apps/api/
COPY apps/api/config/ ./config/
USER app
EXPOSE 3000
# Migrate then start — releases apply schema changes atomically before serving.
CMD sh -c "pnpm exec typeorm migration:run -d dist/apps/api/libs/database/src/data-source.js && node dist/apps/api/apps/api/src/main.js"
