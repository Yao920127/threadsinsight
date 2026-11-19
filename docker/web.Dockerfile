# ThreadsInsight 前端：以 bun 建置靜態檔，再由 nginx（非 root）提供，並轉送 /api 到 API 服務。

FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json vite.config.ts index.html login.html compare.html ./
COPY public ./public
COPY shared ./shared
COPY src ./src
RUN bun run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
# API_UPSTREAM：/api 轉送的目的地。NGINX_ENTRYPOINT_LOCAL_RESOLVERS：啟動時從 /etc/resolv.conf
# 取得 DNS 伺服器（compose 是 Docker 內建 DNS，Railway 是私有網路 DNS），供 nginx 解析 API 位址。
ENV API_UPSTREAM=api:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
# templates 內的 ${API_UPSTREAM} 等在容器啟動時由 envsubst 代入
COPY docker/nginx/default.conf.template docker/nginx/security-headers.inc.template /etc/nginx/templates/
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
