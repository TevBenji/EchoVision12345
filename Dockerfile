# --- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install deps first so this layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- serve ---------------------------------------------------------------
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html

# The nginx image's entrypoint runs envsubst over /etc/nginx/templates/*.template.
# The FILTER is essential: without it envsubst would also eat nginx's own $uri,
# $host and friends, and the SPA fallback would silently stop working.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=PORT

# Railway (and Cloud Run, and Heroku) inject PORT. Default for local runs.
ENV PORT=80
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://localhost:${PORT}/" >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
