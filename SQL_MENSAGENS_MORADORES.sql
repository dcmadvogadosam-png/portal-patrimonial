-- Execute este SQL no Supabase antes de usar o menu "Fale com seu síndico".
-- Ele cria a tabela de comunicação entre moradores e administração.

create extension if not exists pgcrypto;

create table if not exists public.mensagens_moradores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  morador_id uuid not null references public.profiles(id) on delete cascade,
  morador_nome text,
  morador_unidade text,
  remetente_tipo text not null check (remetente_tipo in ('morador','admin')),
  assunto text not null,
  descricao text not null,
  respondida boolean not null default false,
  created_by uuid,
  thread_id uuid,
  deletado_morador boolean not null default false,
  deletado_admin boolean not null default false
);

create index if not exists idx_mensagens_moradores_condominio on public.mensagens_moradores(condominio_id);
create index if not exists idx_mensagens_moradores_morador on public.mensagens_moradores(morador_id);
create index if not exists idx_mensagens_moradores_created_at on public.mensagens_moradores(created_at);
create index if not exists idx_mensagens_moradores_thread on public.mensagens_moradores(thread_id);

alter table public.mensagens_moradores add column if not exists thread_id uuid;
alter table public.mensagens_moradores add column if not exists deletado_morador boolean not null default false;
alter table public.mensagens_moradores add column if not exists deletado_admin boolean not null default false;

alter table public.mensagens_moradores enable row level security;

-- O projeto usa o Worker com service_role para ler/gravar com segurança.
-- Estas policies também ajudam caso alguma leitura direta pelo cliente seja feita futuramente.
drop policy if exists "admin gerencia mensagens" on public.mensagens_moradores;
drop policy if exists "morador visualiza suas mensagens" on public.mensagens_moradores;
drop policy if exists "morador cria suas mensagens" on public.mensagens_moradores;

create policy "admin gerencia mensagens"
on public.mensagens_moradores
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.ativo,true) = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.ativo,true) = true));

create policy "morador visualiza suas mensagens"
on public.mensagens_moradores
for select
using (morador_id = auth.uid());

create policy "morador cria suas mensagens"
on public.mensagens_moradores
for insert
with check (morador_id = auth.uid() and remetente_tipo = 'morador');
