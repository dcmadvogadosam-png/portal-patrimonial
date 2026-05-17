-- PORTAL TRANSPARÊNCIA DM - SCHEMA SUPABASE COMPLETO
-- Uso recomendado para projeto novo:
-- 1) Supabase > SQL Editor > cole e execute este arquivo inteiro.
-- 2) Crie o administrador em Authentication > Users.
-- 3) Rode o bloco final de criação do perfil admin trocando o UUID e e-mail.

create extension if not exists pgcrypto;

create table if not exists public.condominios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text unique,
  role text not null default 'morador' check (role in ('admin', 'morador')),
  unidade text,
  condominio_id uuid references public.condominios(id) on delete set null,
  cpf text,
  celular text,
  placa_veiculo text,
  foto_placa_veiculo_url text,
  pessoas_moram_junto jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  tipo text not null default 'despesa' check (tipo in ('receita', 'despesa')),
  data date not null,
  valor numeric(12,2) not null check (valor >= 0),
  categoria text,
  descricao text,
  local text,
  justificativa text,
  anexo_url text,
  nota_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Compatibilidade para bancos já existentes.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists unidade text;
alter table public.profiles add column if not exists condominio_id uuid references public.condominios(id) on delete set null;
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists celular text;
alter table public.profiles add column if not exists placa_veiculo text;
alter table public.profiles add column if not exists foto_placa_veiculo_url text;
alter table public.profiles add column if not exists pessoas_moram_junto jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists ativo boolean not null default true;

alter table public.lancamentos add column if not exists local text;
alter table public.lancamentos add column if not exists anexo_url text;
alter table public.lancamentos add column if not exists nota_url text;
alter table public.lancamentos add column if not exists created_by uuid references auth.users(id) on delete set null;

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do update set public = true;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and ativo = true
  );
$$;

alter table public.condominios enable row level security;
alter table public.profiles enable row level security;
alter table public.lancamentos enable row level security;

drop policy if exists "condominios_public_select" on public.condominios;
drop policy if exists "condominios_admin_all" on public.condominios;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "lancamentos_select_admin_or_morador_condominio" on public.lancamentos;
drop policy if exists "lancamentos_admin_all" on public.lancamentos;
drop policy if exists "documentos_public_read" on storage.objects;
drop policy if exists "documentos_authenticated_upload" on storage.objects;
drop policy if exists "documentos_admin_update" on storage.objects;
drop policy if exists "documentos_admin_delete" on storage.objects;

-- Necessário para a tela inicial listar condomínios antes do login do morador.
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

create policy "lancamentos_select_admin_or_morador_condominio"
on public.lancamentos for select
to authenticated
using (
  public.is_admin()
  or condominio_id in (
    select p.condominio_id from public.profiles p where p.id = auth.uid() and p.ativo = true
  )
);

create policy "lancamentos_admin_all"
on public.lancamentos for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_condominio on public.profiles(condominio_id);
create index if not exists idx_profiles_pessoas_moram_junto on public.profiles using gin(pessoas_moram_junto);
create index if not exists idx_lancamentos_condominio on public.lancamentos(condominio_id);
create index if not exists idx_lancamentos_data on public.lancamentos(data desc);

-- PRIMEIRO ADMINISTRADOR:
-- 1. Supabase > Authentication > Users > Add user.
-- 2. Copie o UUID criado.
-- 3. Execute o exemplo abaixo, trocando os dados:
--
-- insert into public.profiles (id, nome, email, role, ativo)
-- values ('COLE_AQUI_UUID_DO_USUARIO_ADMIN', 'Administrador DM', 'dm@dmpatrimonial.com', 'admin', true)
-- on conflict (id) do update
-- set role = 'admin', nome = excluded.nome, email = excluded.email, ativo = true;
