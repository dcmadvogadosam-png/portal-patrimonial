-- VERIFICAÇÃO RÁPIDA DO BANCO PARA TROCA DE SENHA
-- Execute no Supabase SQL Editor se quiser conferir se profile.id = auth.users.id.

select 
  p.id as profile_id,
  u.id as auth_id,
  p.nome,
  p.email,
  p.role,
  p.ativo,
  case when p.id = u.id then 'OK - IDS IGUAIS' else 'ERRO - IDS DIFERENTES' end as status_id
from public.profiles p
left join auth.users u on lower(u.email) = lower(p.email)
order by p.created_at desc;

-- Para o método simples funcionar perfeitamente, todo morador precisa:
-- 1) existir em public.profiles
-- 2) existir em auth.users com o mesmo e-mail
-- 3) preferencialmente ter profile.id = auth.users.id
