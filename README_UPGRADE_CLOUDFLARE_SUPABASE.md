# Portal Patrimonial - Cloudflare + Supabase - Upgrade

Esta versão foi montada a partir do projeto atual `portal-patrimonial-main` e recebeu a estrutura/layout avançado do painel administrativo do projeto antigo `portal-dm-transparencia-main`.

## O que foi mantido
- `config.js` do projeto atual foi mantido com as credenciais públicas já configuradas.
- Estrutura Cloudflare Pages Functions em `functions/api`.

## O que foi atualizado
- Layout premium do painel administrativo.
- Cadastro completo de moradores.
- Foto do morador.
- CPF, celular, e-mail de contato, placa do veículo e moradores vinculados.
- Relatório de moradores.
- Exportação CSV/PDF/backup, conforme estrutura do projeto antigo.
- Rotas Netlify removidas do JavaScript.
- Rotas adaptadas para Cloudflare:
  - `/api/create-user`
  - `/api/delete-user`
  - `/api/update-user-password`

## Variáveis necessárias no Cloudflare
Configure em Workers & Pages > projeto > Settings > Build > Variables and secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

A chave `service_role` nunca deve ser colocada no `config.js`.

## Banco de dados Supabase
Use o arquivo:

`schema_supabase_portal_transparencia_COMPLETO.sql`

Ele cria/atualiza:
- condominios
- profiles
- lancamentos
- anexos
- bucket documentos
- políticas RLS
- permissões
- índices

O script é idempotente e não apaga dados existentes.

## Deploy
1. Envie todos os arquivos deste projeto para o repositório GitHub.
2. Aguarde o Cloudflare fazer o deploy automático.
3. Se necessário, clique em Deployments e confirme se a versão nova está ativa.
4. Teste o login administrativo.
