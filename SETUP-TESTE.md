# CaixaDoBairro — teste separado do Fiado

Este projeto fica em `D:\Jogos\BCKPARENAS\Aqui\NexSales` (pasta local; marca do produto: **CaixaDoBairro**).  
O **Fiado do rapaz** continua intacto em `trevoa-ai/fiado/` (GitHub Pages).

Não misture o banco: use um **projeto Supabase novo** só pro CaixaDoBairro (ou o mesmo projeto só se souber o que está fazendo — o schema é outro).

## 1) Dependências

```powershell
cd D:\Jogos\BCKPARENAS\Aqui\NexSales
npm install
copy .env.example .env.local
```

## 2) Supabase (projeto NOVO recomendado)

1. [supabase.com](https://supabase.com) → New project  
2. SQL Editor → cole **`TODAS-MIGRATIONS.sql`** (já junta tudo na ordem) → **Run**  
   (alternativa: os arquivos de `supabase/migrations/` um a um na ordem do nome)  
3. Settings → API → copie URL e keys  
4. Em Authentication → Providers → Email (habilitado)

## 3) `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

A `service_role` **não** vai no front público; só no `.env.local` / Vercel.

## 4) Rodar

```powershell
npm run dev
```

Abre http://localhost:3000 — crie usuário pelo login do próprio CaixaDoBairro (primeiro user no Supabase Auth).

## 5) Deploy depois (quando gostar)

1. Push pro seu GitHub  
2. Importar na [Vercel](https://vercel.com)  
3. Colar as mesmas env vars  
4. Deploy  

Produção atual: https://nex-sales.vercel.app

## Fronteira com o Fiado

| App | Pasta | Pra quem |
|-----|--------|----------|
| Fiado (caderno) | `trevoa-ai/fiado` | Cliente que já está testando |
| CaixaDoBairro (PDV) | `NexSales` (pasta local) | Teste / produto de caixa e estoque |
