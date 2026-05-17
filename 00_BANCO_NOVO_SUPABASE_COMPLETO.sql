-- ============================================================
-- PORTAL TRANSPARÊNCIA DM - BANCO NOVO COMPLETO SUPABASE
-- Execute este arquivo inteiro em Supabase > SQL Editor.
--
-- IMPORTANTE:
-- 1) Este script apaga e recria as tabelas públicas do portal.
-- 2) Ele NÃO apaga usuários de Authentication automaticamente.
-- 3) Para começar 100% limpo, apague manualmente os usuários antigos em:
--    Supabase > Authentication > Users
-- 4) Depois crie o usuário administrador em Authentication > Users
--    e execute o bloco "CRIAR PERFIL ADMINISTRADOR" no final.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- LIMPEZA DAS TABELAS PÚBLICAS DO PORTAL
-- ============================================================

drop table if exists public.lancamentos cascade;
drop table if exists public.profiles cascade;
drop table if exists public.condominios cascade;

-- ============================================================
-- TABELA: CONDOMÍNIOS
-- ============================================================

create table public.condominios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: PROFILES
-- Esta tabela guarda os dados do administrador e dos moradores.
-- O campo id é o mesmo UUID do Supabase Auth.
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
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

-- ============================================================
-- TABELA: LANÇAMENTOS
-- O morador só visualiza lançamentos do próprio condomínio.
-- O painel do morador usa apenas despesas.
-- ============================================================

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  tipo text not null default 'despesa' check (tipo in ('receita', 'despesa')),
  data date not null default current_date,
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

-- ============================================================
-- STORAGE
-- ============================================================

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do update set public = true;

-- ============================================================
-- FUNÇÃO: VERIFICAR SE O USUÁRIO LOGADO É ADMIN
-- ============================================================

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
      and ativo = true
  );
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.condominios enable row level security;
alter table public.profiles enable row level security;
alter table public.lancamentos enable row level security;

-- CONDOMÍNIOS
create policy "condominios_select_public"
on public.condominios
for select
to anon, authenticated
using (true);

create policy "condominios_admin_all"
on public.condominios
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- PROFILES
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_insert"
on public.profiles
for insert
to authenticated
with check (public.is_admin());

create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_admin_delete"
on public.profiles
for delete
to authenticated
using (public.is_admin());

-- LANÇAMENTOS
create policy "lancamentos_select_admin_or_morador_condominio"
on public.lancamentos
for select
to authenticated
using (
  public.is_admin()
  or condominio_id in (
    select p.condominio_id
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'morador'
      and p.ativo = true
  )
);

create policy "lancamentos_admin_insert"
on public.lancamentos
for insert
to authenticated
with check (public.is_admin());

create policy "lancamentos_admin_update"
on public.lancamentos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "lancamentos_admin_delete"
on public.lancamentos
for delete
to authenticated
using (public.is_admin());

-- STORAGE POLICIES
drop policy if exists "documentos_public_read" on storage.objects;
drop policy if exists "documentos_authenticated_upload" on storage.objects;
drop policy if exists "documentos_admin_update" on storage.objects;
drop policy if exists "documentos_admin_delete" on storage.objects;

create policy "documentos_public_read"
on storage.objects
for select
to public
using (bucket_id = 'documentos');

create policy "documentos_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'documentos');

create policy "documentos_admin_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'documentos' and public.is_admin())
with check (bucket_id = 'documentos' and public.is_admin());

create policy "documentos_admin_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'documentos' and public.is_admin());

-- ============================================================
-- ÍNDICES
-- ============================================================

create index idx_profiles_email on public.profiles(email);
create index idx_profiles_role on public.profiles(role);
create index idx_profiles_condominio_id on public.profiles(condominio_id);
create index idx_profiles_pessoas_moram_junto on public.profiles using gin(pessoas_moram_junto);
create index idx_lancamentos_condominio_id on public.lancamentos(condominio_id);
create index idx_lancamentos_tipo on public.lancamentos(tipo);
create index idx_lancamentos_data on public.lancamentos(data desc);

-- ============================================================
-- DADOS INICIAIS OPCIONAIS
-- ============================================================

insert into public.condominios (nome, endereco)
values ('Condomínio Orquídea', '')
on conflict do nothing;

-- ============================================================
-- CRIAR PERFIL ADMINISTRADOR
-- ============================================================
-- Passo 1:
-- Vá em Supabase > Authentication > Users > Add user.
-- Crie o usuário administrador com e-mail e senha.
--
-- Passo 2:
-- Copie o ID/UUID desse usuário.
--
-- Passo 3:
-- Execute o comando abaixo trocando:
--   COLE_AQUI_UUID_DO_ADMIN
--   SEU_EMAIL_ADMIN
--
-- Exemplo:
--
-- insert into public.profiles (id, nome, email, role, ativo)
-- values (
--   'COLE_AQUI_UUID_DO_ADMIN',
--   'Administrador DM',
--   'SEU_EMAIL_ADMIN',
--   'admin',
--   true
-- )
-- on conflict (id) do update
-- set nome = excluded.nome,
--     email = excluded.email,
--     role = 'admin',
--     ativo = true;
