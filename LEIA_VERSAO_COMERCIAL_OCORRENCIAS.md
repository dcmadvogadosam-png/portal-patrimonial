# Versão comercial - Ocorrências e Demandas

## O que foi atualizado

- Login administrativo agora aceita usuários internos de setores, além de `admin`.
- Perfis internos suportados em `profiles.role`:
  - `administrativo`
  - `engenharia`
  - `financeiro`
  - `juridico`
  - `manutencao`
  - `seguranca`
  - `limpeza`
  - `obras`
  - `prestadores`
- Usuário interno acessa apenas o módulo **Ocorrências e Demandas**.
- Usuário interno visualiza as ocorrências direcionadas ao seu setor/perfil.
- Categorias agora podem ter um perfil responsável (`responsavel_role`).
- Morador agora pode abrir ocorrência pelo painel do morador.
- Administrador continua vendo todas as ocorrências.
- Histórico continua registrando movimentações.

## Banco de dados

Execute o arquivo:

`SQL_MODULO_OCORRENCIAS_DEMANDAS.sql`

Ele é compatível com o SQL anterior. Não apaga dados e não altera as tabelas antigas do portal.

## Observação importante

A tabela criada anteriormente não gera conflito. Esta versão apenas adiciona colunas novas com `IF NOT EXISTS`.
