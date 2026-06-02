# Módulo de Ocorrências e Demandas

Antes de publicar o projeto atualizado no GitHub/Cloudflare, execute no Supabase o arquivo:

`SQL_MODULO_OCORRENCIAS_DEMANDAS.sql`

Este SQL foi ajustado para ser compatível com o banco atual informado, considerando as tabelas já existentes:

- `condominios`
- `profiles`
- `portaria_logins`

Ele não apaga dados e não modifica a estrutura das tabelas antigas. Apenas cria as tabelas novas do módulo de ocorrências:

- `ocorrencia_categorias`
- `ocorrencias`
- `ocorrencia_historico`
- `ocorrencia_comentarios`
- `ocorrencia_anexos`

Depois de executar o SQL, publique o projeto atualizado no GitHub e aguarde o deploy da Cloudflare.
