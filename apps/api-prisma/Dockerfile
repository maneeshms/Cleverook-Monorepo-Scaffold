# ---- builder ----
# Installs the whole workspace, generates the Prisma client + builds the app,
# then emits a lean production manifest listing only this app's external deps.
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
# Block the build if any CRITICAL vulnerability is found in production deps.
RUN npm audit --audit-level=critical --omit=dev
RUN npx nx build api-prisma
RUN node scripts/docker-manifest.mjs apps/api-prisma dist/apps/api-prisma/deploy-package.json

# ---- production ----
# Ships only api-prisma's own dependency closure (Prisma; no TypeORM/messaging).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV CONFIG_DIR=/app/config
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/dist/apps/api-prisma/deploy-package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
# Generated Prisma client (query engine binaries) from the builder, placed after install.
COPY --from=builder /app/node_modules/.prisma/ ./node_modules/.prisma/
COPY --from=builder /app/dist/apps/api-prisma/ ./dist/apps/api-prisma/
COPY apps/api-prisma/prisma/ ./prisma/
COPY apps/api-prisma/config/ ./config/
USER app
EXPOSE 3010
# Migrate then start (prisma CLI ships as a runtime dependency for this).
CMD sh -c "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/apps/api-prisma/apps/api-prisma/src/main.js"
