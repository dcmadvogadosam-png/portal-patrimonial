# Correção: Importar Backup JSON sem API

Esta versão remove a dependência da rota `/api/import-backup`.

A importação agora é feita diretamente pelo Supabase no navegador usando a sessão do administrador logado.

## O que foi corrigido

- Não chama mais `/api/import-backup`, eliminando o erro 405.
- Importa condomínios, moradores e lançamentos.
- Recarrega o painel após a importação.
- Remove o círculo/borda em volta da logo DM.

## Observação importante

O arquivo JSON restaura os dados do painel. Usuários do Supabase Authentication não são recriados pelo JSON.  
Se algum morador restaurado não conseguir login, recrie o acesso dele pelo painel/cadastro.
