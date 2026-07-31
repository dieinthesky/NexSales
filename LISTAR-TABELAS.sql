-- Cole no SQL Editor e Run — depois me manda o resultado (print ou copia)

select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;
