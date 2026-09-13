FROM node:22-bookworm-slim AS build
WORKDIR /app/worker
COPY worker/package.json worker/package-lock.json ./
RUN npm ci
WORKDIR /app
COPY lib/canvas-v2 ./lib/canvas-v2
COPY worker/main.ts worker/build.mjs ./worker/
COPY tsconfig.json ./
RUN npm --prefix worker run build && npm --prefix worker prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=10000 NORTHSTAR_CODEX_BINARY=/app/worker/node_modules/.bin/codex
WORKDIR /app/worker
COPY --from=build --chown=node:node /app/worker/node_modules ./node_modules
COPY --from=build --chown=node:node /app/worker/dist ./dist
USER node
RUN /app/worker/node_modules/.bin/codex --version | grep -Fx 'codex-cli 0.153.4'
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/worker.mjs"]
