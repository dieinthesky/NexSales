# SQL — Master + lojas (rodar no Supabase)

Rode **nesta ordem**, um arquivo por vez (ou o SQL de cada migration):

1. `supabase/migrations/20260801100000_user_role_master.sql`  
   (só adiciona o enum `master`)

2. `supabase/migrations/20260801100001_user_role_master_functions.sql`  
   (helpers + promove `admin@vendas-app.interno` a Master)

3. `supabase/migrations/20260801110000_stores.sql`  
   (tabelas de loja, `store_id`, RLS, copia catálogo para Mercadinho Walter, histórico fica no modelo)

4. `supabase/migrations/20260801110001_stores_rpc.sql`  
   (venda com loja + provisionar/reset Master)

## Depois do SQL

1. Deploy do app (já no Git após push).
2. Entre com **admin** → deve aparecer badge **Master** e menu **Lojas**.
3. Entre com **Walter** → não vê a conta Master; só usuários da loja dele; histórico de vendas da loja dele começa limpo (vendas antigas ficaram no catálogo modelo).
4. Para zerar vendas de uma loja cliente: Master → **Lojas** → **Zerar vendas**.
