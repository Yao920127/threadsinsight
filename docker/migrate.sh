#!/bin/sh
# 依檔名順序套用 supabase/migrations/ 中尚未執行的遷移；每個檔案在單一交易內執行，失敗即停止。
# 已執行的版本記在 supabase_migrations.schema_migrations（與 Supabase CLI 相同的表），
# 之後改用 supabase db push 也能正確辨識。連線資訊來自 PGHOST、PGUSER、PGPASSWORD 等環境變數。
set -eu

psql -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

applied=0
for file in /migrations/*.sql; do
  base=$(basename "$file" .sql)
  version=${base%%_*}
  name=${base#*_}
  done_already=$(psql -tAq -c "select 1 from supabase_migrations.schema_migrations where version = '$version'")
  if [ "$done_already" = "1" ]; then
    echo "skip   $base"
    continue
  fi
  echo "apply  $base"
  psql -v ON_ERROR_STOP=1 -q --single-transaction \
    -f "$file" \
    -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name')"
  applied=$((applied + 1))
done
echo "migrations applied: $applied"
