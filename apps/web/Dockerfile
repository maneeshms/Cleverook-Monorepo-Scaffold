# Web (React + Vite) served by nginx.
# Build context = repo root (do NOT set a Railway Root Directory).

# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
# .npmrc routes the @clevrook design-kit scope to GitHub Packages; the token is
# mounted as a BuildKit secret so it never lands in an image layer or history.
# Build with:  docker build --secret id=github_token,env=GITHUB_TOKEN …
# pnpm-workspace.yaml marks this directory as its OWN workspace root — without it
# pnpm would look for the repo-root workspace, which is not in this context.
COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml apps/web/.npmrc ./
# pnpm ignores credentials in a project .npmrc (see that file), so the token is
# written to the USER-level ~/.npmrc — created and shredded inside a single RUN,
# so it never becomes part of a layer. Both steps run together for the same
# reason: leaving ~/.npmrc behind would bake the token into the image.
RUN --mount=type=secret,id=github_token \
    printf '//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/github_token)" > /root/.npmrc && \
    pnpm install --frozen-lockfile && \
    pnpm audit --audit-level critical --prod; \
    status=$?; rm -f /root/.npmrc; exit $status
COPY apps/web/ ./
RUN pnpm exec tsc -b && pnpm exec vite build --outDir dist

# ---- serve via nginx ----
FROM nginx:alpine
ENV PORT=80
# Point at the API service; nginx proxies /api/* there (same-origin for the SPA).
ENV API_URL=http://localhost:3000
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
