# Correção das rotas API do Worker

Esta versão corrige o problema onde `/api/health` não mostrava as rotas:

- `/api/list-moradores`
- `/api/list-lancamentos`
- `/api/save-lancamento`
- `/api/list-portarias`

Depois de subir no GitHub e aguardar o deploy no Cloudflare, abra:

`https://portal.dmpatrimonial.com/api/health`

Precisa aparecer:

`version: corrigido-rotas-listagem-2026-05-22`

Se não aparecer, o Cloudflare ainda está usando o `_worker.js` antigo.
