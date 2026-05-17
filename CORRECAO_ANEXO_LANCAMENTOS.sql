-- Rode no Supabase SQL Editor para salvar o link da imagem do lançamento corretamente.
-- Essa coluna será usada pelo portal para mostrar a foto no detalhe do lançamento.

alter table public.lancamentos
add column if not exists anexo_url text;

-- Opcional: se você já usava nota_url antes, pode manter também:
alter table public.lancamentos
add column if not exists nota_url text;
