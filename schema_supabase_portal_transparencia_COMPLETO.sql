-- PORTAL PATRIMONIAL / PORTAL DE TRANSPARÊNCIA DM
-- SCHEMA COMPLETO SUPABASE - VERSÃO CLOUDFARE
-- Objetivo: estrutura completa para o projeto atualizado com painel administrativo premium.
-- Este script é idempotente: pode ser executado mais de uma vez sem apagar dados existentes.
-- Execute em: Supabase > SQL Editor > New query > Run

create extension if not exists pgcrypto;

-- =========================
-- TABELAS PRINCIPAIS
-- =========================

create table if not exists public.condominios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  created_at timestamptz not null default now()
);

-- Compatibilidade com versões antigas que usavam name/address.
alter table public.condominios add column if not exists nome text;
alter table public.condominios add column if not exists endereco text;
alter table public.condominios add column if not exists created_at timestamptz not null default now();

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text unique,
  role text not null default 'morador' check (role in ('admin', 'morador')),
  unidade text,
  condominio_id uuid references public.condominios(id) on delete set null,
  ativo boolean not null default true,
  cpf text,
  celular text,
  email_contato text,
  moradores_junto jsonb not null default '[]'::jsonb,
  placa_veiculo text,
  foto_url text,
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
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  tipo text not null default 'despesa' check (tipo in ('receita', 'despesa')),
  data date not null,
  valor numeric(12,2) not null default 0 check (valor >= 0),
  categoria text,
  local text,
  descricao text,
  justificativa text,
  anexo_url text,
  nota_url text,
  comprovante_url text,
  foto_antes_url text,
  foto_depois_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.lancamentos add column if not exists condominio_id uuid references public.condominios(id) on delete cascade;
alter table public.lancamentos add column if not exists tipo text not null default 'despesa';
alter table public.lancamentos add column if not exists data date;
alter table public.lancamentos add column if not exists valor numeric(12,2) not null default 0;
alter table public.lancamentos add column if not exists categoria text;
alter table public.lancamentos add column if not exists local text;
alter table public.lancamentos add column if not exists descricao text;
alter table public.lancamentos add column if not exists justificativa text;
alter table public.lancamentos add column if not exists anexo_url text;
alter table public.lancamentos add column if not exists nota_url text;
alter table public.lancamentos add column if not exists comprovante_url text;
alter table public.lancamentos add column if not exists foto_antes_url text;
alter table public.lancamentos add column if not exists foto_depois_url text;
alter table public.lancamentos add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.lancamentos add column if not exists created_at timestamptz not null default now();

-- Tabela opcional para versões antigas que registravam anexos separados.
create table if not exists public.anexos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid references public.lancamentos(id) on delete cascade,
  condominio_id uuid references public.condominios(id) on delete cascade,
  tipo text not null default 'outro',
  file_path text not null,
  file_name text,
  mime_type text,
  public_url text,
  created_at timestamptz not null default now()
);

-- =========================
-- STORAGE
-- =========================

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do update set public = true;

-- =========================
-- FUNÇÕES DE SEGURANÇA
-- =========================

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

-- =========================
-- RLS
-- =========================

alter table public.condominios enable row level security;
alter table public.profiles enable row level security;
alter table public.lancamentos enable row level security;
alter table public.anexos enable row level security;

-- Remover políticas antigas/conflitantes.
drop policy if exists "condominios_public_select" on public.condominios;
drop policy if exists "condominios_select_authenticated" on public.condominios;
drop policy if exists "condominios_admin_all" on public.condominios;
drop policy if exists "Permitir listar condominios anon" on public.condominios;
drop policy if exists "Admins gerenciam condominios" on public.condominios;
drop policy if exists "Morador ve seu condominio" on public.condominios;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "profiles_admin_select" on public.profiles;
drop policy if exists "profiles_admin_insert" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "profiles_admin_delete" on public.profiles;

drop policy if exists "lancamentos_select_admin_or_morador_condominio" on public.lancamentos;
drop policy if exists "lancamentos_admin_all" on public.lancamentos;
drop policy if exists "anexos_select_admin_or_morador_condominio" on public.anexos;
drop policy if exists "anexos_admin_all" on public.anexos;

drop policy if exists "documentos_public_read" on storage.objects;
drop policy if exists "documentos_authenticated_upload" on storage.objects;
drop policy if exists "documentos_admin_update" on storage.objects;
drop policy if exists "documentos_admin_delete" on storage.objects;

-- Condomínios precisam aparecer na tela inicial antes do login.
create policy "condominios_public_select"
on public.condominios for select
to anon, authenticated
using (true);

create policy "condominios_admin_all"
on public.condominios for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Morador vê seu próprio perfil. Admin vê/gerencia todos.
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_all"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Morador vê lançamentos apenas do próprio condomínio. Admin gerencia todos.
create policy "lancamentos_select_admin_or_morador_condominio"
on public.lancamentos for select
to authenticated
using (
  public.is_admin()
  or condominio_id in (
    select p.condominio_id
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.ativo, true) = true
  )
);

create policy "lancamentos_admin_all"
on public.lancamentos for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "anexos_select_admin_or_morador_condominio"
on public.anexos for select
to authenticated
using (
  public.is_admin()
  or condominio_id in (
    select p.condominio_id
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.ativo, true) = true
  )
);

create policy "anexos_admin_all"
on public.anexos for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Bucket público para exibir fotos/anexos no portal.
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

-- =========================
-- ÍNDICES
-- =========================

create index if not exists idx_condominios_nome on public.condominios(nome);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_condominio on public.profiles(condominio_id);
create index if not exists idx_profiles_cpf on public.profiles(cpf);
create index if not exists idx_profiles_placa_veiculo on public.profiles(placa_veiculo);
create index if not exists idx_lancamentos_condominio on public.lancamentos(condominio_id);
create index if not exists idx_lancamentos_data on public.lancamentos(data desc);
create index if not exists idx_anexos_lancamento on public.anexos(lancamento_id);
create index if not exists idx_anexos_condominio on public.anexos(condominio_id);

-- =========================
-- PERMISSÕES
-- =========================

grant usage on schema public to anon, authenticated;
grant select on public.condominios to anon, authenticated;
grant select, insert, update, delete on public.condominios to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.lancamentos to authenticated;
grant select, insert, update, delete on public.anexos to authenticated;

-- =========================
-- ADMINISTRADOR
-- =========================
-- Depois de criar o usuário em Authentication > Users, rode o bloco abaixo trocando o UUID:
--
-- insert into public.profiles (id, nome, email, role, ativo)
-- values (
--   'COLE_AQUI_O_UUID_DO_USUARIO_AUTH',
--   'Administrador DM Gestão Patrimonial',
--   'dm@dmpatrimonial.com',
--   'admin',
--   true
-- )
-- on conflict (id) do update set
--   nome = excluded.nome,
--   email = excluded.email,
--   role = 'admin',
--   ativo = true;
