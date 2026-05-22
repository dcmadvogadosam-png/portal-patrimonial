-- ============================================================
-- COMPLEMENTO SUPABASE - ACESSO DA PORTARIA
-- Execute este arquivo no Supabase > SQL Editor.
-- Ele NÃO apaga nenhuma tabela existente.
-- ============================================================

create extension if not exists pgcrypto;

-- Permite o novo tipo de usuário "portaria" na tabela profiles.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'morador', 'portaria'));

-- Tabela complementar para gestão dos logins da portaria no painel administrativo.
-- Observação: senha_acesso é armazenada para exibição ao administrador, conforme solicitado.
-- Use senhas fortes e limite o acesso ao painel administrativo.
create table if not exists public.portaria_logins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  nome text not null,
  cpf text,
  celular text,
  email text not null unique,
  senha_acesso text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portaria_logins_condominio_id on public.portaria_logins(condominio_id);
create index if not exists idx_portaria_logins_email on public.portaria_logins(email);
create index if not exists idx_portaria_logins_user_id on public.portaria_logins(user_id);

-- Atualiza updated_at automaticamente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_portaria_logins_updated_at on public.portaria_logins;
create trigger trg_portaria_logins_updated_at
before update on public.portaria_logins
for each row execute function public.set_updated_at();

alter table public.portaria_logins enable row level security;

-- Remove políticas antigas com o mesmo nome, caso você rode este SQL mais de uma vez.
drop policy if exists "portaria_logins_admin_select" on public.portaria_logins;
drop policy if exists "portaria_logins_admin_insert" on public.portaria_logins;
drop policy if exists "portaria_logins_admin_update" on public.portaria_logins;
drop policy if exists "portaria_logins_admin_delete" on public.portaria_logins;
drop policy if exists "profiles_portaria_select_moradores_mesmo_condominio" on public.profiles;

-- Administrador pode gerenciar os logins da portaria.
create policy "portaria_logins_admin_select"
on public.portaria_logins
for select
to authenticated
using (public.is_admin());

create policy "portaria_logins_admin_insert"
on public.portaria_logins
for insert
to authenticated
with check (public.is_admin());

create policy "portaria_logins_admin_update"
on public.portaria_logins
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "portaria_logins_admin_delete"
on public.portaria_logins
for delete
to authenticated
using (public.is_admin());

-- Portaria pode visualizar somente moradores do próprio condomínio.
create policy "profiles_portaria_select_moradores_mesmo_condominio"
on public.profiles
for select
to authenticated
using (
  role = 'morador'
  and condominio_id in (
    select p.condominio_id
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'portaria'
      and p.ativo = true
  )
);
