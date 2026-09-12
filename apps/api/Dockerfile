FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /workspace
COPY package.json bun.lock* turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY apps/api apps/api
COPY packages packages
RUN bun run --filter @niq/application-api build

FROM dependencies AS migrations
COPY apps/api apps/api
COPY packages packages
CMD ["bun", "run", "--cwd", "apps/api", "db:migrate"]

FROM oven/bun:1.4.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S niq && adduser -S niq -G niq
COPY --from=build --chown=niq:niq /workspace/apps/api/dist ./dist
COPY --from=dependencies --chown=niq:niq /workspace/node_modules ./node_modules
USER niq
EXPOSE 3000
CMD ["bun", "dist/index.js"]
