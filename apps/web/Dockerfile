# Web (React + Vite) served by nginx.
# Build context = repo root (do NOT set a Railway Root Directory).

# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
# Block the build on HIGH or CRITICAL vulnerabilities.
RUN npm audit --audit-level=critical --omit=dev
COPY apps/web/ ./
RUN npx tsc -b && npx vite build --outDir dist

# ---- serve via nginx ----
FROM nginx:alpine
ENV PORT=80
# Point at the API service; nginx proxies /api/* there (same-origin for the SPA).
ENV API_URL=http://localhost:3000
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
