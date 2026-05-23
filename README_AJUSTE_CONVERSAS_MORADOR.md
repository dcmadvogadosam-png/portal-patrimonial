# Ajuste: conversas agrupadas no painel do morador

Implementado ajuste no módulo **Fale com seu síndico**:

- O painel do morador agora mostra as conversas em cartões resumidos, evitando poluição visual.
- Ao clicar em uma conversa, o morador visualiza todo o histórico de troca de mensagens com a administração.
- O morador pode excluir uma mensagem individual ou excluir a conversa inteira do próprio painel.
- A exclusão é suave: a mensagem fica oculta para o morador, sem apagar o registro geral do banco.

## Importante

Execute novamente o arquivo `SQL_MENSAGENS_MORADORES.sql` no Supabase.

Ele foi atualizado para adicionar os campos:

- `thread_id`
- `deletado_morador`
- `deletado_admin`

O SQL usa `add column if not exists`, então pode ser executado com segurança mesmo se a tabela já existir.
