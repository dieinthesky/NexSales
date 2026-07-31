<div align="center">

<img src="public/icon-192.png" alt="CaixaDoBairro" width="96" height="96" />

# CaixaDoBairro

**PDV e gestão de vendas para pequenos comércios — offline-first, PWA + app Windows.**

[![CI](https://github.com/MatheusBrazolin/vendas-app/actions/workflows/ci.yml/badge.svg)](https://github.com/MatheusBrazolin/vendas-app/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-nex--sales.vercel.app-6d28d9?style=flat-square)](https://nex-sales.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

Sistema completo de ponto de venda para pequenos comércios: leitor USB de código de barras, controle de estoque, fiado (crédito de loja), relatório diário por e-mail, painel administrativo e suporte offline. Roda no navegador como **PWA** ou como **app desktop instalável no Windows** — após o primeiro login, continua funcionando mesmo sem internet.

## Índice

- [Funcionalidades](#-funcionalidades)
- [Stack](#-stack)
- [Rodando localmente](#-rodando-localmente)
- [Deploy](#-deploy)
- [App Desktop (Windows)](#-app-desktop-windows)
- [Relatório diário por e-mail](#-relatório-diário-por-e-mail)
- [Como o offline funciona](#-como-o-offline-funciona)
- [Estrutura do projeto](#-estrutura-do-projeto)
- [Testes](#-testes)
- [Cache de código de barras](#-cache-de-código-de-barras)
- [Segurança](#-segurança)
- [Roadmap](#-roadmap)
- [Licença](#-licença)

---

## ✨ Funcionalidades

### Ponto de Venda (PDV)
- Busca de produtos por **nome ou código de barras** (leitor USB ou câmera)
- Carrinho com ajuste de quantidade e **substituição de preço por item** (promoções e correções)
- Métodos de pagamento: **Dinheiro, PIX, Crédito, Débito e Fiado**
- **Calculadora de troco** automática para pagamentos em dinheiro
- Baixa automática de estoque ao confirmar a venda; bloqueio se o saldo ficar negativo

### Fiado (crédito de loja)
- Cadastro de clientes com nome, telefone e observações
- Vinculação de vendas a clientes com método "Fiado"
- Tela de **saldo devedor por cliente** com histórico de vendas a prazo e registro de pagamentos
- Recibo de pagamento de dívida imprimível

### Produtos e estoque
- CRUD completo de produtos e categorias
- **Auto-preenchimento via código de barras** — ao escanear um EAN/UPC, busca nome e descrição em Cosmos (Bluesoft), Open Food Facts e UPCitemdb, com **cache permanente** no banco (cada código nunca consome mais de uma consulta externa)
- Alerta de estoque baixo no Dashboard e no sidebar

### Controle de acesso
- Dois papéis: **Admin** (acesso total) e **Funcionário** (apenas PDV e vendas do próprio dia)
- Trava implementada no servidor — impossível contornar pela URL
- **Cancelamento de venda** restrito a admins, com restauração atômica de estoque via função PostgreSQL

### Dashboard e relatórios
- KPIs: total do dia, total do mês, ticket médio, alertas de estoque baixo
- Gráfico de vendas dos últimos 30 dias
- Top produtos por quantidade vendida e últimas vendas
- **Relatório de lucro** com análise por período (admin)

### Offline-first
- Catálogo de produtos cacheado em **IndexedDB** (Dexie) — PDV funciona sem internet
- Vendas registradas em fila local durante quedas de conexão e sincronizadas ao reconectar
- Replay idempotente com `client_uuid` — reenvios nunca geram vendas duplicadas
- Indicador visual de conexão + contador de vendas pendentes

### Recibo térmico
- Impressão de recibo **80mm** diretamente pelo navegador
- Disponível online (página da venda) e **offline** (carrinho), com marca-d'água "provisório" até a sincronização

### Outros
- **Dark mode** com toggle no sidebar e persistência via cookie
- Layout **mobile-first** com drawer hambúrguer no celular
- **PWA instalável** — manifesto + Service Worker, ícone próprio e janela standalone
- **App desktop para Windows** — instalador `.exe` (Electron) para uso fixo no caixa
- **Relatório diário de fechamento por e-mail** via Vercel Cron + SMTP

---

## 🛠️ Stack

| Camada | Tecnologia |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Server Components, Server Actions, Turbopack) |
| Linguagem | TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui + framer-motion |
| Banco e Auth | [Supabase](https://supabase.com/) (PostgreSQL + Auth + RLS), região `sa-east-1` (São Paulo) |
| Hospedagem | [Vercel](https://vercel.com) (funções em `gru1` — São Paulo) |
| Validação | [Zod](https://zod.dev/) v4 |
| Formulários | React Hook Form |
| Gráficos | Recharts |
| Notificações | Sonner |
| Ícones | Lucide React |
| PWA | Manifest API do Next.js + Service Worker próprio (`public/sw.js`) |
| Offline | [Dexie](https://dexie.org/) (IndexedDB) — cache de leitura + fila de vendas |
| Desktop | [Electron](https://www.electronjs.org/) + electron-builder (instalador NSIS) |
| E-mail | [Nodemailer](https://nodemailer.com/) (SMTP) + [Vercel Cron](https://vercel.com/docs/cron-jobs) |
| Testes | [Vitest](https://vitest.dev/) + Testing Library + fake-indexeddb |
| CI | GitHub Actions — typecheck + testes + build a cada push |

---

## 🚀 Rodando localmente

### Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com/) (free tier funciona; crie em **South America — São Paulo** para melhor latência)
- Opcional: token do [Cosmos Bluesoft](https://cosmos.bluesoft.com.br/) para lookup de produtos brasileiros

### Setup

```bash
git clone https://github.com/MatheusBrazolin/vendas-app.git
cd vendas-app
npm install
cp .env.example .env.local   # edite com seus valores
npm run dev                  # http://localhost:3000
```

### Variáveis de ambiente

```env
# Supabase (obrigatório)
NEXT_PUBLIC_SUPABASE_URL=https://seuprojeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Barcode lookup (opcional)
COSMOS_API_TOKEN=

# Relatório diário por e-mail (opcional)
CRON_SECRET=          # segredo que protege a rota do cron
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=seuemail@gmail.com
SMTP_PASS=            # senha de app do Gmail, não a senha normal
SMTP_FROM=CaixaDoBairro <seuemail@gmail.com>
REPORT_EMAIL=         # destinatário(s) fixo(s), separados por vírgula
```

### Migrations do banco

No painel do Supabase, abra o **SQL Editor** e execute os arquivos em `supabase/migrations/` **na ordem numérica**:

```
001_initial_schema.sql                          tabelas core + RPC create_sale_with_items
20260525000000_barcode_cache.sql                cache permanente de lookups por EAN/UPC
20260526000000_user_roles.sql                   papéis admin/funcionário + trigger de signup
20260527000000_profiles.sql                     nomes e avatar dos usuários
20260528000000_cancel_sale.sql                  RPC de cancelamento atômico
20260603000000_offline_sales.sql                client_uuid + RPC idempotente (offline)
20260609000000_report_recipients.sql            destinatários do relatório por e-mail
20260611000000_fiado.sql                        clientes, fiado e saldo devedor
20260615000000_customer_balances_v2.sql         view de saldo por cliente (v2)
20260615000001_price_override.sql               substituição de preço por item no PDV
20260615000002_fix_customer_balances_cartesian.sql  correção da view de saldos
20260615000003_fix_price_override_nullif.sql        correção no nullif do override
```

---

## 🌐 Deploy

O app está em produção em **[nex-sales.vercel.app](https://nex-sales.vercel.app)**. As funções serverless rodam em `gru1` (São Paulo) para manter latência baixa junto ao Supabase em `sa-east-1`.

Para subir sua própria instância:

1. Faça fork do repositório
2. Importe em [vercel.com/new](https://vercel.com/new)
3. Adicione as variáveis de ambiente obrigatórias (e opcionalmente as de e-mail)
4. Clique em **Deploy**

---

## 💻 App Desktop (Windows)

Além do acesso pelo navegador, há um **instalador `.exe` para Windows** — ideal para o caixa ter um funcionamento fixo que continua operando se a internet cair.

É um shell Electron ([`electron/main.cjs`](electron/main.cjs)) que abre a versão publicada em janela própria. Como embute o Chromium, o **Service Worker e o cache offline** funcionam normalmente: após o primeiro acesso online (necessário para login), o app continua vendendo sem internet, com as vendas sincronizadas ao reconectar.

```bash
# Rodar em modo dev (abre uma janela; aponta para produção)
npm run desktop

# Apontar para servidor local (PowerShell)
$env:CaixaDoBairro_APP_URL="http://localhost:3000"; npm run desktop

# Gerar instalador → instalador/CaixaDoBairro-Instalador.exe
npm run desktop:build
```

### Disponibilizar o download no site

A página **`/configuracoes/baixar`** (menu Administração — visível apenas no desktop e para admins) exibe o botão de download, que aponta para o GitHub Releases:

1. Gere o instalador com `npm run desktop:build`
2. Crie um **Release** no GitHub e anexe `CaixaDoBairro-Instalador.exe` como asset
3. O botão usa a URL estável do último release; ao publicar uma nova versão com o mesmo nome de arquivo, o download é atualizado automaticamente

Para hospedar em outro lugar, defina `NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL`.

> **Build no Windows:** o `electron-builder` precisa criar symlinks ao extrair o `winCodeSign`. Se ocorrer erro de permissão, ative o **Modo Desenvolvedor** em *Configurações → Privacidade → Para desenvolvedores* ou execute o terminal como Administrador.

> **Login offline:** a autenticação é feita pelo Supabase e exige conexão. O cenário coberto é "estava logado e a internet caiu". Um cold start completamente offline com sessão expirada ainda requer rede para autenticar.

---

## 📧 Relatório diário por e-mail

Todo dia às **20h (horário de Brasília)** o sistema envia um resumo do fechamento de caixa: total, número de vendas, ticket médio e breakdown por forma de pagamento.

**Como funciona:**

- Um **Vercel Cron** (`0 23 * * *` UTC = 20h BRT) chama a rota protegida [`/api/cron/daily-cash-close`](src/app/api/cron/daily-cash-close/route.ts)
- A rota exige o header `Authorization: Bearer $CRON_SECRET` (enviado automaticamente pela Vercel)
- O resumo é montado via service-role (sem sessão de usuário) e enviado por SMTP (Nodemailer)

**Quem recebe** (deduplicado, sem e-mails internos):

1. Administradores com e-mail real
2. Endereços definidos em `REPORT_EMAIL`
3. E-mails ativos cadastrados em **`/configuracoes/relatorio`**

A tela de destinatários permite adicionar, ativar/desativar e remover endereços sem precisar alterar variáveis de ambiente.

---

## 🔌 Como o offline funciona

O servidor (Supabase) é sempre a fonte de verdade; o offline é **otimista** e reconcilia ao reconectar.

```
LEITURA                              ESCRITA (PDV)
─────────────────────────────────    ─────────────────────────────────────
SyncProvider sincroniza produtos     Online?
e categorias para IndexedDB          ├─ sim  → cria venda no servidor (RPC)
em cada reconexão / foco de aba.     │         falha de rede → cai p/ fila
PDV lê do cache local →              └─ não  → grava na fila (IndexedDB)
funciona com ou sem internet.                  baixa estoque local (otimista)

                                     Ao reconectar — flushPendingSales():
                                     • reenvia cada venda com client_uuid
                                       (idempotente — nunca cria duplicata)
                                     • sucesso → remove da fila + re-sync
                                     • estoque insuficiente → marca "rejeitada"
                                       para revisão manual (não descarta)
```

**Decisões-chave:**

- **Idempotência:** a RPC `create_sale_with_items` devolve a venda existente se o `client_uuid` já foi gravado — reenvios após falha parcial nunca criam duplicatas
- **Conflito de estoque entre caixas:** dois caixas offline podem vender o mesmo item. O servidor rejeita o segundo na sincronização (`insufficient_stock`), marcando a venda como `rejeitada` para o admin resolver — sem furar o estoque silenciosamente

---

## 📂 Estrutura do projeto

```
src/
├── app/
│   ├── (auth)/             /login, recuperação de senha
│   ├── (dashboard)/        área autenticada
│   │   ├── clientes/       cadastro de clientes e controle de fiado
│   │   ├── configuracoes/  usuários, baixar app, destinatários do relatório (admin)
│   │   ├── dashboard/      KPIs, gráfico, top produtos, alertas (admin)
│   │   ├── produtos/       CRUD de produtos e categorias (admin)
│   │   ├── relatorios/     relatório de lucro por período (admin)
│   │   ├── vendas/         PDV (/nova), histórico, recibo, cancelamento
│   │   └── layout.tsx
│   ├── api/cron/           rota do relatório diário (Vercel Cron)
│   ├── manifest.ts         PWA manifest
│   └── layout.tsx          root — fontes, toaster, registro do SW
├── components/
│   ├── dashboard/          widgets de KPI, gráfico, alertas de estoque
│   ├── layout/             sidebar (desktop + mobile drawer), header, breadcrumb
│   ├── products/           formulário com auto-preenchimento por barcode
│   ├── sales/              PDV, carrinho, cancelar venda, recibo
│   ├── pwa/                SW register, botão instalar, indicador offline,
│   │                        SyncProvider, badge de vendas pendentes
│   └── ui/                 primitivos de UI (shadcn/ui)
├── hooks/                  hooks React utilitários
├── lib/
│   ├── auth/roles.ts       getCurrentUser, requireAdmin, isAdmin
│   ├── barcode/lookup.ts   Cosmos → Open Food Facts → UPCitemdb + cache
│   ├── email/              mailer SMTP, builder do relatório, destinatários
│   ├── offline/            cache IndexedDB (Dexie), sync, fila de vendas
│   ├── queries/            consultas tipadas ao Supabase
│   ├── supabase/           clients (server / client / middleware / service)
│   ├── utils/              format, datetime (BRT), receipt, print-receipt
│   └── validations/        schemas Zod
└── types/database.ts       tipos gerados a partir do schema Supabase
electron/
├── main.cjs                shell desktop que carrega o app publicado
└── icon.png                ícone do instalador Windows
public/
├── icon-*.png              ícones PWA
├── sw.js                   Service Worker
└── icon-source.svg         SVG-fonte dos ícones
supabase/migrations/        migrations SQL em ordem cronológica
scripts/
└── generate-pwa-icons.mjs  gera os PNGs do PWA a partir do SVG-fonte
```

---

## 🧪 Testes

Testes unitários com **Vitest** + jsdom + `fake-indexeddb` para a camada offline.  
Os arquivos de teste ficam ao lado do código que cobrem (`*.test.ts`).

```bash
npm test              # roda toda a suíte uma vez
npm run test:watch    # modo watch durante o desenvolvimento
npm run test:coverage # relatório de cobertura
```

| Área | O que é verificado |
|------|--------------------|
| `lib/validations` | Schemas Zod (login, funcionário, produto, categoria) |
| `lib/offline/sales-repo` | Fila offline: baixa otimista, idempotência via `client_uuid`, erro terminal × transitório |
| `lib/offline/products-repo` | Busca por nome/código, filtro de inativos e sem estoque |
| `vendas/actions` | `createSale`: mapeamento de erros do servidor para mensagem + código |
| `lib/utils/format` | Moeda (BRL), datas, rótulos de pagamento |
| `lib/utils/print-receipt` | Recibo 80mm: conteúdo, marca "provisório", escape de HTML |
| `lib/email/cash-close-email` | Assunto, HTML e texto do relatório; singular/plural; dia vazio |
| `lib/email/report-recipients` | Merge das 3 fontes de destinatários, dedupe, filtro de internos |

> Módulos marcados com `server-only` são neutralizados por um stub no `vitest.config.mts`, sem configuração adicional nos arquivos de teste.

UI e fluxos completos estão mapeados para testes E2E (Playwright) em etapa futura.

---

## 🧠 Cache de código de barras

```
[1] Produto já cadastrado?     → avisa e descarta
       ↓ não
[2] Código em barcode_cache?   → reusa (zero consultas externas)
       ↓ não
[3] Cosmos → Open Food Facts → UPCitemdb
       ↓
[4] Grava em barcode_cache     → próxima consulta é instantânea
```

---

## 🔐 Segurança

- **Secrets fora do repo** — `.env*` e `.claude/` no `.gitignore`
- **RLS habilitado** em todas as tabelas (`products`, `categories`, `sales`, `sale_items`, `customers`, `user_roles`, `profiles`, `barcode_cache`, `report_recipients`)
- **Autenticação server-side** — o layout autenticado chama `getCurrentUser()` antes de qualquer render; páginas admin reforçam com `requireAdmin()`
- **Defense in depth no cancelamento** — restrito a admins no Node.js *e* na função PostgreSQL (`is_admin()` levanta `42501` se falso)
- **Service Worker sem cache stale** — headers `Content-Type` e `no-cache` configurados em `next.config.ts`

---

## 🗺️ Roadmap

- [x] PDV com carrinho, métodos de pagamento e calculadora de troco
- [x] Cancelamento de venda com restauração atômica de estoque
- [x] Controle de acesso admin / funcionário (trava no servidor)
- [x] PWA instalável (manifesto + Service Worker)
- [x] Cache offline de produtos (IndexedDB via Dexie)
- [x] Fila de vendas offline + replay idempotente + conflito de estoque
- [x] App desktop Windows (Electron + NSIS)
- [x] Recibo térmico 80mm — online e offline (provisório)
- [x] Relatório diário de fechamento por e-mail (Vercel Cron + SMTP)
- [x] Tela admin de destinatários do relatório
- [x] Relatório de lucro por período
- [x] Fiado — crédito de loja com cadastro de clientes e controle de saldo
- [x] Substituição de preço por item no PDV
- [x] Dark mode com toggle e persistência via cookie
- [x] Layout mobile-first com sidebar responsiva
- [x] Testes unitários da lógica crítica (Vitest)
- [ ] Testes E2E (Playwright) do fluxo completo de venda
- [ ] Emissão de NFC-e via serviço terceirizado
- [ ] Exportação de relatórios (CSV / PDF)
- [ ] Login offline (sessão em cache para cold start sem internet)

---

## 📜 Licença

[MIT](LICENSE) © CaixaDoBairro
