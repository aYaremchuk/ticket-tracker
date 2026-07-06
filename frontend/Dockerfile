# Multi-stage: build the Vite SPA with Node, then serve the static output via nginx.

# --- Build stage ---
FROM node:22-slim AS build
WORKDIR /app

# Install deps from the lockfile first (cached until package files change).
COPY package.json package-lock.json* ./
RUN npm ci

# Build the production bundle.
COPY . .
RUN npm run build

# --- Serve stage ---
FROM nginx:1.27-alpine AS serve
# nginx site config (SPA fallback + /api proxy).
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Compiled static assets.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
