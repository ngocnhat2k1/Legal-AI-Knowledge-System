# syntax=docker/dockerfile:1

# --- base: Node 22 LTS with Corepack (Yarn 4) ---
FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable

# --- build: install all deps and compile the API ---
FROM base AS build
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack yarn install --immutable
COPY tsconfig.json nest-cli.json drizzle.config.ts ./
COPY apps ./apps
COPY db ./db
COPY public ./public
RUN corepack yarn build

# --- runtime: shared by the `migrate` and `api` services ---
# Keeps the full node_modules from the build stage: the `migrate` service runs the
# TypeScript migrator with tsx (a dev dependency), while `api` runs compiled JS.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/public ./public
COPY --from=build /app/apps/zalo-bot ./apps/zalo-bot
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# Default command; the `migrate`, `seed`, and `zalo-bot` services override it in docker-compose.
CMD ["node", "dist/apps/api/main.js"]
