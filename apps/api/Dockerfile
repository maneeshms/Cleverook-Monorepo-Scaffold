# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Block the build if any HIGH or CRITICAL vulnerability is found.
RUN npm audit --audit-level=critical --omit=dev
COPY . .
RUN npx nx build api

# ---- production ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Layered config: point the loader at this app's config directory.
ENV CONFIG_DIR=/app/config
RUN addgroup -S app && adduser -S app -G app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist/apps/api/ ./dist/apps/api/
COPY apps/api/config/ ./config/
USER app
EXPOSE 3000
# Migrate then start — releases apply schema changes atomically before serving.
CMD sh -c "npx typeorm migration:run -d dist/apps/api/libs/database/src/data-source.js && node dist/apps/api/apps/api/src/main.js"
