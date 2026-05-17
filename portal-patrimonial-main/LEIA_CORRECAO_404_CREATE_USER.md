# CORREÇÃO DO ERRO 404 EM /api/create-user

Este pacote foi ajustado para funcionar também quando o Cloudflare publica o projeto como **Worker com Assets**, não apenas como Cloudflare Pages Functions.

## O que foi adicionado

- `_worker.js`: cria as rotas:
  - `/api/create-user`
  - `/api/delete-user`
  - `/api/health`
- `wrangler.toml`: configura o Worker para entregar os arquivos estáticos e as APIs.
- `package.json`: adiciona script de deploy com Wrangler.

## Configuração no Cloudflare

Em **Settings > Build configuration**:

- Root directory / Path:
  `portal-patrimonial-main`

- Build command:
  deixe vazio

- Deploy command:
  `npx wrangler deploy`

- Non-production branch deploy command:
  pode deixar como está

As variáveis precisam estar em **Variables and Secrets**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Teste

Depois do New deployment, acesse:

`https://SEU-DOMINIO/api/health`

Se estiver correto, deve retornar JSON com:

```json
{
  "ok": true,
  "mode": "worker-assets"
}
```

Depois acesse:

`https://SEU-DOMINIO/api/create-user`

Deve retornar JSON dizendo que a API está ativa. Se aparecer 404, o deploy ainda não pegou o Worker novo.

## Segurança

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no `config.js`.