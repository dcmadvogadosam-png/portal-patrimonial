-- OPCIONAL E PERIGOSO: apaga as tabelas do Portal Transparência.
-- Use somente se tiver certeza e se já tiver backup dos dados.
-- Depois execute schema_supabase_portal_transparencia.sql.

drop table if exists public.lancamentos cascade;
drop table if exists public.profiles cascade;
drop table if exists public.condominios cascade;
