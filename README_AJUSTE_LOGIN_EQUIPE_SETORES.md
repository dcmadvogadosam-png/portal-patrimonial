# Ajuste do Login da Equipe / Setores

Atualização aplicada na tela inicial do Portal Transparência.

Agora a tela de login exibe 4 abas:

- Morador
- Administrador
- Portaria
- Equipe

## Como funciona a aba Equipe

A aba Equipe é destinada aos usuários internos dos setores:

- Administrativo
- Engenharia
- Financeiro
- Jurídico
- Manutenção
- Segurança
- Limpeza
- Obras
- Prestadores

Esses usuários devem existir no Supabase Auth e também na tabela `profiles` com o campo `role` preenchido com um dos perfis acima.

Exemplo de `role` válido:

```text
engenharia
financeiro
juridico
manutencao
seguranca
administrativo
```

Quando o usuário entra pela aba Equipe, o sistema valida se o perfil pertence a um setor interno. Se pertencer, ele acessa o painel de ocorrências correspondente ao setor.

## Observação importante

Esta atualização não altera nem apaga dados existentes. Ela apenas separa visualmente o acesso dos setores internos para não confundir com o login do Administrador.
