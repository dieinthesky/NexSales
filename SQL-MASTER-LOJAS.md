# SQL — rode **um arquivo só**

Arquivo: **`RODAR-MASTER-LOJAS-TUDO.sql`**

1. Abra o SQL Editor do Supabase  
2. Cole o arquivo inteiro  
3. Rode (Run)

Inclui de uma vez: role Master, lojas/isolamente, RPCs, e **PIX da loja** (colunas + permissão do admin atualizar a chave).

É idempotente — se falhar no meio, pode rodar de novo.

## Se o banco já está ok e falta só PIX

Opcional: `RODAR-STORE-PIX.sql` (o mesmo bloco de PIX que já está no final do arquivo grande).

## Depois do SQL

1. Deploy do app se ainda não subiu.  
2. Admin Master → menu **Lojas** / **PIX da loja**.  
3. Cadastrar a chave PIX em **Configurações → PIX da loja**.  
4. No caixa, código **24** mostra o QR.
