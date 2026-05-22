# Correção do login admin sem alterar RLS/policies do Supabase

Esta versão corrige o login administrativo sem mexer na estrutura do banco e sem abrir policies da tabela `profiles`.

O frontend agora busca o perfil autenticado pela rota segura `/api/me`, executada no Cloudflare Worker com `SUPABASE_SERVICE_ROLE_KEY`.

Isso evita o erro 500 causado por RLS/policy na consulta direta `profiles?id=eq...`, mantendo o restante do banco como já está funcionando.

## Depois de subir no GitHub
1. Aguarde o deploy do Cloudflare ficar Success.
2. Abra `https://portal.dmpatrimonial.com/api/health` e confira se as variáveis aparecem como OK.
3. Abra `https://portal.dmpatrimonial.com` e pressione Ctrl + F5.
4. Teste o login administrador.
