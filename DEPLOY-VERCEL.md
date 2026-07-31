# Subir o CaixaDoBairro sem rodar npm no PC

Use **Vercel** (grátis) ligada ao GitHub.

## 1) Repo no GitHub

Use o fork/repo do projeto na sua conta (pasta local ainda pode se chamar `CaixaDoBairro`).

Fica algo como: `https://github.com/SEU-USUARIO/CaixaDoBairro`

## 2) Vercel

1. [vercel.com](https://vercel.com) → Add New → Project  
2. Importa o repo  
3. Em **Environment Variables**, cola:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OFFLINE_SESSION_SECRET` (qualquer string longa e aleatória)
4. Deploy  

No fim a Vercel mostra um link tipo:  
`https://nex-sales.vercel.app`  
(você pode renomear o projeto na Vercel para `caixadobairro` depois)

---

## 3) Auth no Supabase (importante)

No **NEXUS CAIXA**:

1. **Authentication → URL Configuration**  
2. Em **Site URL**, cola o link da Vercel  
3. Em **Redirect URLs**, adiciona:  
   `https://SEU-LINK.vercel.app/**`

Sem isso o login pode falhar.

---

## 4) Criar usuário

Abre o link da Vercel → login do CaixaDoBairro (usuário criado no Supabase Auth).

---

Pronto: testando na nuvem, sem `npm` no computador.
