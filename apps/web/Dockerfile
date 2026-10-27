FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /workspace
COPY package.json bun.lock* turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/report-pdf/package.json packages/report-pdf/package.json
COPY packages/monitoring/package.json packages/monitoring/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/report-pdf packages/report-pdf
COPY packages/monitoring packages/monitoring
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_SENTRY_RELEASE
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE
RUN bun run --filter @niq/application-web build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
