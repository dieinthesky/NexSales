# App Windows — CaixaDoBairro

Neste PC o Node/npm completo não está instalado. O instalador é gerado no **GitHub Actions** (nuvem).

## 1) Secrets no GitHub (uma vez)

1. Abre: https://github.com/dieinthesky/NexSales/settings/secrets/actions  
2. **New repository secret** — cria estes 3:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zxctuiwkkkgelemdaujc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a mesma anon/publishable da Vercel |
| `OFFLINE_SESSION_SECRET` | qualquer texto longo (pode ser o da Vercel) |

## 2) Subir o código deste repo

No GitHub Desktop: commit das mudanças do desktop + **Push origin**.

## 3) Gerar o .exe

1. https://github.com/dieinthesky/NexSales/actions  
2. **Build desktop Windows** → **Run workflow** → **Run workflow**  
3. Espera ficar verde (~10–20 min)  
4. Vai em **Releases** (menu do repo) → baixa `CaixaDoBairro-Instalador.exe`

Link estável do botão no site:  
`https://github.com/dieinthesky/NexSales/releases/latest/download/CaixaDoBairro-Instalador.exe`

## 4) (Opcional) Vercel

Se quiser forçar a URL do botão:

- Key: `NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL`  
- Value: o link acima  
- Redeploy  

## 5) No PC do caixa

1. Baixa pelo site (**Baixar app**) ou pelo Releases  
2. Instala (se o Windows avisar SmartScreen → Mais informações → Executar assim mesmo)  
3. Abre **CaixaDoBairro** → login online na 1ª vez  

Depois disso, o ícone na área de trabalho abre o PDV sem precisar do navegador.
