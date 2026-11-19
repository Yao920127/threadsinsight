# ThreadsInsight 前端：以 bun 建置靜態檔，再由 nginx（非 root）提供，並轉送 /api 到 API 服務。

FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json vite.config.ts index.html login.html compare.html ./
COPY public ./public
COPY shared ./shared
COPY src ./src
# 這兩個值會打包進瀏覽器，只能是可公開的 publishable key，絕不可傳 secret／service role key
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_PUBLISHABLE_KEY" \
  || (echo "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are required (see .env.example)" && exit 1)
RUN case "$VITE_SUPABASE_PUBLISHABLE_KEY" in sb_publishable_*) ;; \
  *) echo "VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key (sb_publishable_...)" && exit 1 ;; esac
RUN bun run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
# templates 內的 ${CSP_CONNECT_SRC} 等在容器啟動時由 envsubst 代入
COPY docker/nginx/default.conf.template docker/nginx/security-headers.inc.template /etc/nginx/templates/
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
