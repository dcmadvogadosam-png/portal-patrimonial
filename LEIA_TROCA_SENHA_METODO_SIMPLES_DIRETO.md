# TROCA DE SENHA - MÉTODO SIMPLES E DIRETO

Esta versão corrige a troca de senha usando o método mais simples:

1. O administrador seleciona o morador.
2. O sistema pega o ID da tabela profiles.
3. Atualiza diretamente a senha no Supabase Authentication.
4. Se o ID estiver divergente, busca pelo e-mail no Authentication e tenta novamente.
5. Se der erro, a tela mostra o detalhe técnico real.

## Arquivos principais

- functions/api/update-password.js
- functions/api/diagnostico-supabase.js
- script.js

## Depois de subir no GitHub

1. Aguarde o deploy automático do Cloudflare.
2. Abra:
   https://portal-patrimonial.pages.dev/api/diagnostico-supabase

O resultado precisa ter:
"ok": true

## Confirmação de versão

Abra F12 > Console. Deve aparecer:
Portal DM versão: senha-metodo-simples-direto-2026-05-17

Se não aparecer, o navegador ou Cloudflare ainda está carregando a versão antiga.

## Variáveis obrigatórias no Cloudflare

- SUPABASE_URL = Text
- SUPABASE_SERVICE_ROLE_KEY = Secret

A SUPABASE_SERVICE_ROLE_KEY precisa ter role_detectada = service_role no diagnóstico.
