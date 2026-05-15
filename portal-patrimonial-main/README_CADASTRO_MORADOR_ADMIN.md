# Cadastro de morador pelo painel administrativo

Esta versão permite que o administrador crie o login do morador pelo site.

## Necessário no Cloudflare Pages

Configure as variáveis de ambiente:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

A chave `service_role` fica somente no Cloudflare Function `/api/create-user.js`. Não coloque essa chave no `config.js`.

## Necessário no Supabase

Execute o arquivo:

`ATUALIZACAO_FOTO_PLACA_MORADOR.sql`

Ele adiciona a coluna opcional:

`profiles.foto_placa_veiculo_url`

## Fluxo

1. O admin preenche nome, e-mail, senha, unidade, CPF, celular, placa e condomínio.
2. Opcionalmente anexa a imagem da placa do veículo.
3. O site envia a imagem para o bucket `documentos`.
4. A função segura cria o usuário no `auth.users`.
5. A função cria o registro correspondente em `profiles`.
