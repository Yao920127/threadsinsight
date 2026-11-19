# 資料庫遷移：每次部署時把 db/migrations/ 中尚未套用的檔案套用到 Postgres，
# 透過私有網路連線，執行完即結束（不常駐）。
FROM postgres:17-alpine
COPY db/migrations/ /migrations/
COPY docker/migrate.sh /usr/local/bin/migrate
USER postgres
CMD ["migrate"]
