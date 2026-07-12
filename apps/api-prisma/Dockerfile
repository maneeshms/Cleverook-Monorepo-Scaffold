# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Block the build if any HIGH or CRITICAL vulnerability is found.
RUN npm audit --audit-level=critical --omit=dev
COPY . .
RUN npx nx build api-prisma

# ---- production ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV CONFIG_DIR=/app/config
RUN addgroup -S app && adduser -S app -G app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Generated Prisma client (query engine binaries) from the builder.
COPY --from=builder /app/node_modules/.prisma/ ./node_modules/.prisma/
COPY --from=builder /app/dist/apps/api-prisma/ ./dist/apps/api-prisma/
COPY apps/api-prisma/prisma/ ./prisma/
COPY apps/api-prisma/config/ ./config/
USER app
EXPOSE 3010
# Migrate then start (prisma CLI ships as a runtime dependency for this).
CMD sh -c "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/apps/api-prisma/apps/api-prisma/src/main.js"
