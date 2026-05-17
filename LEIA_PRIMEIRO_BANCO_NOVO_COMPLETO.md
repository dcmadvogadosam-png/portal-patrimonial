# Portal Transparência DM - Banco Novo Completo

## Arquivo principal do banco

Execute no Supabase:

`00_BANCO_NOVO_SUPABASE_COMPLETO.sql`

Esse arquivo cria do zero:

- `condominios`
- `profiles`
- `lancamentos`
- bucket `documentos`
- políticas RLS
- índices
- permissões para admin e morador

## Importante sobre senha de morador

Não foi criada uma tabela separada para senhas. A senha fica no **Supabase Authentication**, que é o local correto e seguro.

O sistema faz assim:

1. O administrador cadastra o morador.
2. A função `/api/create-user` cria o login no Supabase Auth.
3. A tabela `profiles` recebe os dados do morador usando o mesmo ID do Auth.
4. Ao trocar senha, `/api/update-password` localiza o morador pelo ID/e-mail e altera no Supabase Auth.

## Cloudflare Pages

Use estas variáveis:

- `SUPABASE_URL` como Text
- `SUPABASE_SERVICE_ROLE_KEY` como Secret

A chave precisa ser a **service_role**, não a `anon public`.

## Atenção

Este projeto remove o `_worker.js` antigo para evitar conflito com as funções do Cloudflare Pages.

As APIs agora ficam em:

- `functions/api/create-user.js`
- `functions/api/update-password.js`
- `functions/api/delete-user.js`

## Depois de subir no GitHub

1. Faça commit/push.
2. Aguarde o deploy automático no Cloudflare.
3. Teste o cadastro de morador.
4. Teste a troca de senha.
