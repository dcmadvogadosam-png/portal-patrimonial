# Portal Transparência DM - Deploy Cloudflare + Supabase

Este projeto foi adaptado para Cloudflare Pages. As antigas chamadas do Netlify foram removidas.

## 1. Arquivos importantes

- `index.html`, `style.css`, `script.js`: frontend do portal.
- `config.js`: configura a URL pública e a chave `anon public` do Supabase.
- `functions/api/create-user.js`: função Cloudflare para criar login de morador no Supabase Auth.
- `functions/api/delete-user.js`: função Cloudflare para remover login de morador no Supabase Auth.
- `schema_supabase_portal_transparencia.sql`: estrutura completa do banco.

## 2. Supabase

No Supabase do cliente:

1. Abra `SQL Editor`.
2. Execute o arquivo `schema_supabase_portal_transparencia.sql`.
3. Vá em `Authentication > Users` e crie o usuário administrador.
4. Copie o UUID do admin.
5. Execute o bloco final do SQL, trocando UUID, nome e email.
6. Vá em `Project Settings > API` e copie:
   - Project URL
   - anon public key
   - service_role key

## 3. config.js

Edite o arquivo `config.js` antes do deploy:

```js
window.DM_SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
window.DM_SUPABASE_ANON_KEY = "SUA_CHAVE_ANON_PUBLIC";
```

A chave anon public pode ficar no frontend. A chave service_role nunca deve ir no `config.js`.

## 4. Cloudflare Pages

No projeto do Cloudflare Pages:

- Framework preset: `None`
- Build command: deixar vazio
- Build output directory: `/` ou deixar vazio, se a interface permitir

## 5. Variáveis/secrets no Cloudflare

Em `Workers & Pages > seu projeto > Settings > Variables and Secrets`, crie em Production:

- `SUPABASE_URL` = URL do projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` = chave service_role do Supabase

Use tipo `Secret` para `SUPABASE_SERVICE_ROLE_KEY`.

## 6. Domínios

Recomendação:

- Site principal: `dmpatrimonial.com` e/ou `www.dmpatrimonial.com`
- Portal Transparência: `portal.dmpatrimonial.com` ou `transparencia.dmpatrimonial.com`

No Cloudflare Pages, abra cada projeto e configure o domínio em `Custom domains`.

## 7. Testes obrigatórios após deploy

1. Acessar o portal publicado.
2. Confirmar se os condomínios aparecem no login.
3. Entrar como administrador.
4. Criar condomínio.
5. Criar morador com e-mail e senha.
6. Sair e entrar como morador.
7. Criar lançamento com foto/anexo no painel admin.
8. Verificar se o morador visualiza apenas o condomínio dele.
9. Remover lançamento.
10. Remover morador.

## Atualização desta versão

Esta versão foi preparada para novo projeto do Portal Transparência no Cloudflare com deploy automático pelo GitHub. Para banco novo, execute o arquivo `schema_supabase_portal_transparencia.sql`. O cadastro do morador pelo painel administrativo cria o login no Supabase Auth e salva os dados completos na tabela `profiles`, incluindo `pessoas_moram_junto`.
