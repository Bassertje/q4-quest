# Home Assistant passes BUILD_FROM; this add-on uses the official Node image instead.
ARG BUILD_FROM

# ---- Build stage: install everything and build the web frontend ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Runtime stage: only production dependencies, server source and built frontend ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/game/src ./game/src
COPY --from=build /app/web/dist ./web/dist

# Node runs the TypeScript sources directly (type stripping, Node 22.18+).
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]

LABEL io.hass.type="addon" io.hass.arch="aarch64|amd64"
