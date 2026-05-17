# Atualizações aplicadas no Portal Transparência

## Painel do morador
- Layout reorganizado e centralizado.
- Cabeçalho do morador com textos brancos e melhor contraste.
- Removido o card de Receitas para morador.
- Morador visualiza apenas despesas e lançamentos do próprio condomínio.
- Total de despesas do condomínio exibido no painel do morador.

## Painel administrativo
- Adicionada área para alterar senha de morador dentro da aba Moradores.
- Filtro por condomínio.
- Campo de busca por nome, e-mail, unidade ou CPF.
- Seleção do morador e definição de nova senha.

## API Cloudflare Worker
- Nova rota criada: `/api/update-password`.
- Usa `SUPABASE_SERVICE_ROLE_KEY` para alterar a senha no Supabase Auth.
- Apenas administradores logados com `role='admin'` na tabela `profiles` podem executar.

## Depois de enviar para o GitHub
A Cloudflare Pages deve fazer deploy automático. Se não fizer, vá em:

Deployments → Retry deployment
