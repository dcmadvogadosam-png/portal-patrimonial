# Correção do cadastro de moradores

Este pacote corrige o cadastro de moradores pelo painel administrativo.

## 1. Rode o SQL no Supabase

Abra:

`CORRECAO_CADASTRO_MORADORES.sql`

Cole no Supabase em:

SQL Editor > New query > Run

Esse SQL garante que a tabela `profiles` fique compatível com o cadastro de moradores, incluindo:

- `nome`
- `email`
- `role`
- `unidade`
- `condominio_id`
- `cpf`
- `celular`
- `placa_veiculo`
- `foto_placa_veiculo_url`
- `ativo`

## 2. Cloudflare

Mantenha as variáveis:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Não coloque a service_role_key no config.js.

## 3. Teste

Depois do deploy, abra:

`https://portal.dm-patrimonial.com/api/health`

Depois faça login como admin e tente cadastrar um morador.

## Observação importante

O condomínio cadastra direto na tabela `condominios`.

O morador é diferente: para ter login, ele precisa ser criado primeiro no `auth.users` do Supabase e depois na tabela `profiles`. Por isso o projeto usa a API segura `/api/create-user`.
