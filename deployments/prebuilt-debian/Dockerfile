FROM node:24.22.2-trixie AS base
WORKDIR /app
COPY package.json .
COPY pnpm-lock.yaml .
COPY pnpm-workspace.yaml .
RUN corepack enable pnpm && pnpm install --frozen-lockfile
CMD ["sleep", "60s"]