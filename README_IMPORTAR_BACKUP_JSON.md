# Atualização: Importar Backup JSON

Foi adicionada no painel administrativo, na aba **Relatórios e Backup**, a opção:

**Importar backup JSON**

## O que a importação faz

- Lê o backup JSON gerado pelo próprio portal.
- Importa/atualiza condomínios.
- Importa/atualiza moradores.
- Cria automaticamente usuários no Supabase Auth quando um morador do backup ainda não existe em Authentication > Users.
- Importa/atualiza lançamentos.
- Recarrega o painel após a importação.

## Arquivos alterados/adicionados

- `index.html`
- `script.js`
- `style.css`
- `functions/api/import-backup.js`

## Importante

A função `/api/import-backup` usa a variável `SUPABASE_SERVICE_ROLE_KEY` no Cloudflare.  
Confirme se ela está configurada como Secret no projeto Cloudflare Pages.

## Segurança

A importação só funciona se o usuário logado for administrador (`profiles.role = 'admin'`).
