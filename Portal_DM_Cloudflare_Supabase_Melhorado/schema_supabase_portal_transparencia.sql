-- PORTAL TRANSPARÊNCIA DM - SUPABASE SCHEMA COMPLETO
-- Execute este arquivo no Supabase > SQL Editor do projeto do cliente.
-- Depois crie o usuário administrador em Authentication > Users e rode o bloco final comentado.

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
  justificativa text,
  anexo_url text,
  nota_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.lancamentos add column if not exists anexo_url text;
alter table public.lancamentos add column if not exists nota_url text;
alter table public.lancamentos add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists unidade text;
alter table public.profiles add column if not exists condominio_id uuid references public.condominios(id) on delete set null;

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
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.condominios enable row level security;
alter table public.profiles enable row level security;
alter table public.lancamentos enable row level security;

drop policy if exists "condominios_public_select" on public.condominios;
drop policy if exists "condominios_select_authenticated" on public.condominios;
drop policy if exists "condominios_admin_all" on public.condominios;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "lancamentos_select_admin_or_morador_condominio" on public.lancamentos;
drop policy if exists "lancamentos_admin_all" on public.lancamentos;
drop policy if exists "documentos_public_read" on storage.objects;
drop policy if exists "documentos_authenticated_upload" on storage.objects;
drop policy if exists "documentos_admin_update" on storage.objects;
drop policy if exists "documentos_admin_delete" on storage.objects;

-- Necessário para a tela inicial exibir a lista de condomínios antes do login.
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
    select p.condominio_id from public.profiles p where p.id = auth.uid()
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
create index if not exists idx_lancamentos_condominio on public.lancamentos(condominio_id);
create index if not exists idx_lancamentos_data on public.lancamentos(data desc);

-- PASSO FINAL PARA LIBERAR O PRIMEIRO ADMINISTRADOR:
-- 1. No Supabase, crie o usuário em Authentication > Users.
-- 2. Copie o UUID do usuário criado.
-- 3. Rode o comando abaixo trocando UUID, nome e email:
--
-- insert into public.profiles (id, nome, email, role)
-- values ('COLE_AQUI_UUID_DO_USUARIO_ADMIN', 'Administrador DM', 'email@cliente.com', 'admin')
-- on conflict (id) do update
-- set role = 'admin', nome = excluded.nome, email = excluded.email;
