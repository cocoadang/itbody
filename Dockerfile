# Production image for Cloud Run service pt-journey (itbody.dsoom.com / itbody.ai.studio).
# Built from a clean Linux checkout so no locally installed node_modules leak in.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/firebase-applet-config.json ./firebase-applet-config.json
# dist/ is served statically, so keep the server bundle outside it and ship no source map.
RUN mkdir -p server && mv dist/server.cjs server/server.cjs && rm -f dist/server.cjs.map
USER node
# server.ts listens on a fixed port.
EXPOSE 3000
CMD ["node", "server/server.cjs"]
