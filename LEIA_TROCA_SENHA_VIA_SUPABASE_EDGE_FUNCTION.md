# TROCA DE SENHA VIA SUPABASE EDGE FUNCTION

Esta versão tira a troca de senha da Cloudflare e faz diretamente no Supabase.

## 1. Publicar a Edge Function no Supabase

No Supabase:
Edge Functions > Open Editor > New Function

Nome da função:
update-resident-password

Cole o conteúdo do arquivo:
supabase/functions/update-resident-password/index.ts

Salve e faça Deploy.

## 2. Secrets da Edge Function

A Edge Function usa estes secrets do próprio Supabase:

SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

Normalmente o Supabase já fornece esses secrets automaticamente para Edge Functions.
Se faltar algum, vá em Edge Functions > Secrets e adicione.

## 3. Atualizar o Portal no GitHub

Suba este projeto no GitHub.
Aguarde o deploy automático da Cloudflare.

## 4. Testar

Faça login como administrador e tente alterar a senha do morador.

Agora o fluxo será:

Portal admin -> Supabase Edge Function -> Supabase Authentication

Isso elimina o problema da função antiga da Cloudflare.
