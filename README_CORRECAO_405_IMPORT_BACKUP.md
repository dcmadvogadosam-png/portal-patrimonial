# Correção 405 - Importar Backup JSON

O erro 405 em `/api/import-backup` acontecia porque havia um `_worker.js` no projeto.
No Cloudflare Pages, o `_worker.js` pode assumir as rotas e impedir que as funções em `functions/api/` sejam executadas corretamente.

## Correção aplicada

- Removido `_worker.js`
- Mantida a função:
  - `functions/api/import-backup.js`
- Adicionada função de teste:
  - `functions/api/health.js`

## Após subir no GitHub e aguardar o deploy

Teste:

https://portal-patrimonial.pages.dev/api/health

Precisa retornar:

{
  "ok": true
}

Depois teste novamente a importação do backup JSON.
