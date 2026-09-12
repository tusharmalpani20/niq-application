FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /workspace
COPY package.json bun.lock* turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN bun run --filter @niq/application-web build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
