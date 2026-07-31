# Se der "already exists"

Só no projeto **NEXUS CAIXA** (não no Fiado).

## Opção A — Reset pelo painel (mais fácil)

1. Supabase → **Project Settings** → **Database**
2. Procure **Reset database** / **Restart** e confirme o reset do banco
3. Depois rode de novo o `TODAS-MIGRATIONS.sql`

## Opção B — SQL limpa o schema public

**New query**, cole isto, **Run**:

```sql
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
grant all on all tables in schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;
create extension if not exists "pgcrypto" with schema extensions;
```

Aí **New query** de novo → cola `TODAS-MIGRATIONS.sql` → **Run**.

Tem que dar **Success** sem "already exists".
