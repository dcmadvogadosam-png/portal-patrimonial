# Atualização: Área da Portaria

Esta versão adiciona:

- Login da Portaria na tela inicial.
- Menu **Portaria** no painel do administrador.
- Cadastro de porteiro(a) por condomínio com nome, CPF, celular, e-mail e senha.
- Gestão de logins da portaria por condomínio, com opção de editar e remover.
- Painel da portaria com listagem dos moradores do condomínio vinculado.
- Filtro inteligente por nome, CPF, unidade, telefone, placa, e-mail e pessoas vinculadas ao morador.
- Telefone do morador clicável, abrindo uma janela para assunto/descrição e envio pelo WhatsApp.

## SQL obrigatório

Antes de testar a portaria, execute no Supabase o arquivo:

`SQL_COMPLEMENTAR_PORTARIA_SUPABASE.sql`

Ele cria a tabela `portaria_logins`, libera o papel `portaria` na tabela `profiles` e adiciona as políticas RLS necessárias.

## Observação de segurança

A senha da portaria é salva na tabela `portaria_logins.senha_acesso` para que o administrador consiga visualizar a senha no painel, conforme solicitado. Recomenda-se usar senhas fortes e restringir bem o acesso ao painel administrativo.
