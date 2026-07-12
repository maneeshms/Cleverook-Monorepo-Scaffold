# Web-Next (Next.js App Router, standalone output).
# Build context = repo root. Pattern: deps → build → minimal runner (non-root).

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/web-next/package.json apps/web-next/package-lock.json ./
RUN npm ci
RUN npm audit --audit-level=critical --omit=dev

# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web-next/ ./
RUN npm run build

# ---- run ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3005
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
