# Portal Transparência DM — versão atualizada

Esta versão mantém o layout visual do portal e atualiza o fluxo de cadastro de moradores.

## O que foi atualizado

- Mantido o layout premium atual do portal.
- Cadastro de morador pelo painel administrativo cria automaticamente:
  - usuário no Supabase Authentication;
  - perfil completo na tabela `profiles`;
  - vínculo com o condomínio selecionado;
  - login de acesso para o morador.
- Inserido campo **Pessoas que moram junto com este morador** no formulário.
- Os nomes das pessoas que moram junto são salvos em `profiles.pessoas_moram_junto` no formato `jsonb`.
- Atualizado o schema SQL completo para banco novo no Supabase.
- Mantido o Worker `/api/create-user` para criar login com `SUPABASE_SERVICE_ROLE_KEY` no Cloudflare.

## Deploy automático Cloudflare + GitHub

1. Crie um novo repositório no GitHub.
2. Envie todos os arquivos desta pasta para o repositório.
3. No Cloudflare, vá em **Workers & Pages**.
4. Clique em **Create application**.
5. Escolha **Pages** e depois **Connect to Git**.
6. Selecione o repositório do portal.
7. Use configurações simples:
   - Framework preset: `None`
   - Build command: deixe vazio
   - Build output directory: `/`
8. Depois do deploy, configure as variáveis de ambiente:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
9. Faça um novo deploy para aplicar as variáveis.

## Supabase

Como você informou que vai apagar as tabelas atuais, execute primeiro:

`schema_supabase_portal_transparencia.sql`

Depois crie o usuário administrador em **Authentication > Users** e rode o bloco final comentado no SQL para transformar esse usuário em admin.

## Importante

Nunca coloque a `SUPABASE_SERVICE_ROLE_KEY` dentro do `config.js`. Ela deve ficar somente nas variáveis de ambiente do Cloudflare.

O `config.js` deve continuar apenas com:

- URL pública do Supabase;
- anon key pública do Supabase.
