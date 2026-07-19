# ---- builder ----
# Installs the whole workspace (libs compile into the app's dist), builds the app,
# then emits a lean production manifest listing only this app's external deps.
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
# Block the build if any CRITICAL vulnerability is found in production deps.
RUN npm audit --audit-level=critical --omit=dev
RUN npx nx build api
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
# Trivy flags. npm/npx is used at runtime (migrations via `npx typeorm`), so it
# stays in the image — upgrade it to the current npm 11.x (patched vendored deps)
# instead. Pinned to the 11 line because npm 12 requires node >=22.22.2, newer
# than node:22-alpine ships; 11.x needs only >=22.9.0. Self-heals within the 11
# line on rebuild, matching the rolling base image + daily image scan.
RUN npm install -g npm@11 && npm cache clean --force
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/dist/apps/api/deploy-package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/dist/apps/api/ ./dist/apps/api/
COPY apps/api/config/ ./config/
USER app
EXPOSE 3000
# Migrate then start — releases apply schema changes atomically before serving.
CMD sh -c "npx typeorm migration:run -d dist/apps/api/libs/database/src/data-source.js && node dist/apps/api/apps/api/src/main.js"
