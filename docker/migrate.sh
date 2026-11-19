#!/bin/sh
# 依檔名順序套用 /migrations（來自 db/migrations/）中尚未執行的遷移；
# 每個檔案在單一交易內執行，失敗即停止。已執行的版本記在 public.schema_migrations。
# 連線資訊來自 PGHOST、PGPORT、PGUSER、PGPASSWORD、PGDATABASE 環境變數。
set -eu

psql -v ON_ERROR_STOP=1 -q <<'SQL'
create table if not exists public.schema_migrations (
  version text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);
SQL

applied=0
for file in /migrations/*.sql; do
  base=$(basename "$file" .sql)
  version=${base%%_*}
  name=${base#*_}
  done_already=$(psql -tAq -c "select 1 from public.schema_migrations where version = '$version'")
  if [ "$done_already" = "1" ]; then
    echo "skip   $base"
    continue
  fi
  echo "apply  $base"
  psql -v ON_ERROR_STOP=1 -q --single-transaction \
    -f "$file" \
    -c "insert into public.schema_migrations (version, name) values ('$version', '$name')"
  applied=$((applied + 1))
done
echo "migrations applied: $applied"
