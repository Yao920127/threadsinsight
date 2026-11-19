# ThreadsInsight 架構圖：把 floorplan 匯出的靜態 HTML（docs/floorplan/）交給 nginx（非 root）提供。
# 更新方式：重新產生架構圖後執行 node floorplan/serve.mjs --export docs/floorplan/index.html 並推上 GitHub。
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY docker/nginx/floorplan.conf /etc/nginx/conf.d/default.conf
COPY docs/floorplan/ /usr/share/nginx/html/
EXPOSE 8080
