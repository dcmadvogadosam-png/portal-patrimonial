-- CORREÇÃO DEFINITIVA PARA CADASTRO DE MORADORES PELO PAINEL ADMINISTRATIVO
-- Execute no Supabase: SQL Editor > New query > Run
-- Este script NÃO apaga dados. Ele apenas garante compatibilidade da tabela profiles.

create extension if not exists pgcrypto;

-- Garante tabela de condomínios compatível com o painel.
create table if not exists public.condominios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  created_at timestamptz not null default now()
);

alter table public.condominios add column if not exists nome text;
alter table public.condominios add column if not exists endereco text;
alter table public.condominios add column if not exists created_at timestamptz not null default now();

-- IMPORTANTE:
-- O login do morador fica em auth.users.
-- A tabela profiles guarda os dados do morador e precisa usar o mesmo UUID de auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text unique,
  role text not null default 'morador',
  unidade text,
  condominio_id uuid references public.condominios(id) on delete set null,
  ativo boolean not null default true,
  cpf text,
  celular text,
  email_contato text,
  moradores_junto jsonb not null default '[]'::jsonb,
  placa_veiculo text,
  foto_url text,
  foto_placa_veiculo_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists nome text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'morador';
alter table public.profiles add column if not exists unidade text;
alter table public.profiles add column if not exists condominio_id uuid references public.condominios(id) on delete set null;
alter table public.profiles add column if not exists ativo boolean not null default true;
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists celular text;
alter table public.profiles add column if not exists email_contato text;
alter table public.profiles add column if not exists moradores_junto jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists placa_veiculo text;
alter table public.profiles add column if not exists foto_url text;
alter table public.profiles add column if not exists foto_placa_veiculo_url text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Recria/ajusta constraint de role com segurança.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema='public'
      and table_name='profiles'
      and constraint_name='profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
end $$;

alter table public.profiles
add constraint profiles_role_check
check (role in ('admin', 'morador'));

-- Bucket público para fotos/anexos.
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do update set public = true;

-- Função que o RLS usa para conferir administrador.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(ativo, true) = true
  );
$$;

alter table public.condominios enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "condominios_public_select" on public.condominios;
drop policy if exists "condominios_admin_all" on public.condominios;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;

create policy "condominios_public_select"
on public.condominios for select
to anon, authenticated
using (true);

create policy "condominios_admin_all"
on public.condominios for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_all"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Políticas do storage para anexar foto da placa.
drop policy if exists "documentos_public_read" on storage.objects;
drop policy if exists "documentos_authenticated_upload" on storage.objects;
drop policy if exists "documentos_admin_update" on storage.objects;
drop policy if exists "documentos_admin_delete" on storage.objects;

create policy "documentos_public_read"
on storage.objects for select
to public
using (bucket_id = 'documentos');

create policy "documentos_authenticated_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'documentos');

create policy "documentos_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'documentos' and public.is_admin())
with check (bucket_id = 'documentos' and public.is_admin());

create policy "documentos_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'documentos' and public.is_admin());

create index if not exists idx_condominios_nome on public.condominios(nome);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_condominio on public.profiles(condominio_id);
create index if not exists idx_profiles_cpf on public.profiles(cpf);
create index if not exists idx_profiles_placa_veiculo on public.profiles(placa_veiculo);

grant usage on schema public to anon, authenticated;
grant select on public.condominios to anon, authenticated;
grant select, insert, update, delete on public.condominios to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

-- Conferência final:
select
  'profiles pronta para cadastro de moradores' as status,
  exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='profiles'
      and column_name='foto_placa_veiculo_url'
  ) as tem_coluna_foto_placa;
