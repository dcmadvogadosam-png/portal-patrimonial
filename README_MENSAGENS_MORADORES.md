# Atualização: Fale com seu síndico

Esta versão adiciona comunicação interna entre morador e administração sem remover as funções existentes.

## O que foi adicionado

- Botão **Fale com seu síndico** no painel do morador.
- Modal com campos **Assunto** e **Descrição** para o morador enviar mensagem.
- Área no painel do morador para visualizar mensagens e respostas da administração.
- Nova aba administrativa **Mensagens dos moradores**.
- Filtro por condomínio no painel administrativo.
- Lista de moradores que enviaram mensagem.
- Conversa por morador com possibilidade de resposta do administrador.
- Novas rotas no Cloudflare Worker:
  - `/api/list-mensagens`
  - `/api/send-mensagem`
  - `/api/reply-mensagem`

## Passo obrigatório no Supabase

Antes de usar a nova função, execute no Supabase SQL Editor o arquivo:

`SQL_MENSAGENS_MORADORES.sql`

Esse arquivo cria a tabela `mensagens_moradores` e os índices/policies necessários.

## Arquivos alterados

- `index.html`
- `script.js`
- `style.css`
- `_worker.js`

## Importante

Não foi alterada a estrutura principal de login, cadastro de moradores, lançamentos, portaria, backup ou configuração `config.js`.
