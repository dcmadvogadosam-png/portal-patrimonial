-- ============================================================
-- PORTAL TRANSPARÊNCIA - MÓDULO DE OCORRÊNCIAS E DEMANDAS
-- SQL compatível com o banco atual informado pelo usuário.
-- Base considerada existente:
--   public.condominios(id, nome, endereco, created_at)
--   public.profiles(id, nome, email, role, unidade, condominio_id, ...)
--   public.portaria_logins(...)
--
-- IMPORTANTE:
-- 1) Este SQL NÃO apaga dados.
-- 2) Este SQL NÃO altera as tabelas atuais do portal.
-- 3) Ele cria apenas tabelas novas do módulo de ocorrências.
-- 4) Pode ser executado por cima com segurança, pois usa IF NOT EXISTS.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. CATEGORIAS / SLA
-- ============================================================
create table if not exists public.ocorrencia_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  setor_responsavel text not null,
  responsavel_padrao text,
  prazo_dias integer not null default 3,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Garante compatibilidade caso uma versão anterior da tabela já exista.
alter table public.ocorrencia_categorias add column if not exists setor_responsavel text;
alter table public.ocorrencia_categorias add column if not exists responsavel_padrao text;
alter table public.ocorrencia_categorias add column if not exists prazo_dias integer default 3;
alter table public.ocorrencia_categorias add column if not exists ativo boolean default true;
alter table public.ocorrencia_categorias add column if not exists created_at timestamptz default now();
alter table public.ocorrencia_categorias add column if not exists updated_at timestamptz default now();

-- ============================================================
-- 2. OCORRÊNCIAS
-- ============================================================
create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  numero_ocorrencia text not null unique,

  -- Compatível com a tabela public.condominios existente.
  condominio_id uuid references public.condominios(id) on delete set null,

  unidade text,
  solicitante text not null,
  solicitante_tipo text,

  categoria_id uuid references public.ocorrencia_categorias(id) on delete set null,
  categoria_nome text not null,

  responsavel_setor text,
  responsavel_nome text,
  responsavel_id uuid,

  prioridade text not null default 'Normal',
  status text not null default 'Aberta',
  descricao text not null,

  data_prazo date,
  data_conclusao timestamptz,

  -- created_by é mantido sem FK obrigatória para não gerar conflito
  -- com usuários antigos ou perfis incompletos.
  created_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ocorrencias_prioridade_check check (
    prioridade in ('Baixa', 'Normal', 'Alta', 'Urgente')
  ),
  constraint ocorrencias_status_check check (
    status in (
      'Aberta',
      'Em análise',
      'Em execução',
      'Aguardando terceiros',
      'Aguardando aprovação',
      'Concluída',
      'Cancelada'
    )
  )
);

-- Compatibilidade caso uma versão anterior da tabela já exista.
alter table public.ocorrencias add column if not exists numero_ocorrencia text;
alter table public.ocorrencias add column if not exists condominio_id uuid;
alter table public.ocorrencias add column if not exists unidade text;
alter table public.ocorrencias add column if not exists solicitante text;
alter table public.ocorrencias add column if not exists solicitante_tipo text;
alter table public.ocorrencias add column if not exists categoria_id uuid;
alter table public.ocorrencias add column if not exists categoria_nome text;
alter table public.ocorrencias add column if not exists responsavel_setor text;
alter table public.ocorrencias add column if not exists responsavel_nome text;
alter table public.ocorrencias add column if not exists responsavel_id uuid;
alter table public.ocorrencias add column if not exists prioridade text default 'Normal';
alter table public.ocorrencias add column if not exists status text default 'Aberta';
alter table public.ocorrencias add column if not exists descricao text;
alter table public.ocorrencias add column if not exists data_prazo date;
alter table public.ocorrencias add column if not exists data_conclusao timestamptz;
alter table public.ocorrencias add column if not exists created_by uuid;
alter table public.ocorrencias add column if not exists created_at timestamptz default now();
alter table public.ocorrencias add column if not exists updated_at timestamptz default now();

-- ============================================================
-- 3. HISTÓRICO IMUTÁVEL DA OCORRÊNCIA
-- ============================================================
create table if not exists public.ocorrencia_historico (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.ocorrencias(id) on delete cascade,
  usuario_id uuid,
  usuario_nome text,
  acao text not null,
  status_anterior text,
  status_novo text,
  comentario text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. COMENTÁRIOS INTERNOS
-- ============================================================
create table if not exists public.ocorrencia_comentarios (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.ocorrencias(id) on delete cascade,
  usuario_id uuid,
  usuario_nome text,
  comentario text not null,
  tipo text not null default 'interno',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. ANEXOS DA OCORRÊNCIA
-- ============================================================
create table if not exists public.ocorrencia_anexos (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.ocorrencias(id) on delete cascade,
  nome_arquivo text,
  url_arquivo text not null,
  tipo_arquivo text,
  enviado_por uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. ÍNDICES PARA DESEMPENHO
-- ============================================================
create index if not exists idx_ocorrencia_categorias_nome on public.ocorrencia_categorias(nome);
create index if not exists idx_ocorrencias_numero on public.ocorrencias(numero_ocorrencia);
create index if not exists idx_ocorrencias_condominio on public.ocorrencias(condominio_id);
create index if not exists idx_ocorrencias_status on public.ocorrencias(status);
create index if not exists idx_ocorrencias_categoria on public.ocorrencias(categoria_nome);
create index if not exists idx_ocorrencias_responsavel_setor on public.ocorrencias(responsavel_setor);
create index if not exists idx_ocorrencias_prazo on public.ocorrencias(data_prazo);
create index if not exists idx_ocorrencias_created_at on public.ocorrencias(created_at desc);
create index if not exists idx_ocorrencia_historico_ocorrencia on public.ocorrencia_historico(ocorrencia_id);
create index if not exists idx_ocorrencia_comentarios_ocorrencia on public.ocorrencia_comentarios(ocorrencia_id);
create index if not exists idx_ocorrencia_anexos_ocorrencia on public.ocorrencia_anexos(ocorrencia_id);

-- ============================================================
-- 7. TRIGGER PARA UPDATED_AT
-- ============================================================
create or replace function public.set_updated_at_ocorrencias()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ocorrencia_categorias_updated_at on public.ocorrencia_categorias;
create trigger trg_ocorrencia_categorias_updated_at
before update on public.ocorrencia_categorias
for each row execute function public.set_updated_at_ocorrencias();

drop trigger if exists trg_ocorrencias_updated_at on public.ocorrencias;
create trigger trg_ocorrencias_updated_at
before update on public.ocorrencias
for each row execute function public.set_updated_at_ocorrencias();

-- ============================================================
-- 8. RLS / POLÍTICAS
-- O portal usa Cloudflare Worker com SERVICE_ROLE_KEY nas rotas do módulo.
-- Mesmo assim, deixamos leitura autenticada liberada para não bloquear telas futuras.
-- ============================================================
alter table public.ocorrencia_categorias enable row level security;
alter table public.ocorrencias enable row level security;
alter table public.ocorrencia_historico enable row level security;
alter table public.ocorrencia_comentarios enable row level security;
alter table public.ocorrencia_anexos enable row level security;

drop policy if exists "ocorrencia_categorias_read_auth" on public.ocorrencia_categorias;
create policy "ocorrencia_categorias_read_auth"
on public.ocorrencia_categorias
for select
to authenticated
using (true);

drop policy if exists "ocorrencias_read_auth" on public.ocorrencias;
create policy "ocorrencias_read_auth"
on public.ocorrencias
for select
to authenticated
using (true);

drop policy if exists "ocorrencia_historico_read_auth" on public.ocorrencia_historico;
create policy "ocorrencia_historico_read_auth"
on public.ocorrencia_historico
for select
to authenticated
using (true);

drop policy if exists "ocorrencia_comentarios_read_auth" on public.ocorrencia_comentarios;
create policy "ocorrencia_comentarios_read_auth"
on public.ocorrencia_comentarios
for select
to authenticated
using (true);

drop policy if exists "ocorrencia_anexos_read_auth" on public.ocorrencia_anexos;
create policy "ocorrencia_anexos_read_auth"
on public.ocorrencia_anexos
for select
to authenticated
using (true);

-- ============================================================
-- 9. CATEGORIAS PADRÃO
-- ============================================================
insert into public.ocorrencia_categorias
  (nome, setor_responsavel, responsavel_padrao, prazo_dias, ativo)
values
  ('Engenharia', 'Engenharia', '', 5, true),
  ('Manutenção', 'Manutenção', '', 3, true),
  ('Financeiro', 'Financeiro', '', 2, true),
  ('Jurídico', 'Jurídico', '', 10, true),
  ('Administrativo', 'Administrativo', '', 3, true),
  ('Segurança', 'Segurança', '', 2, true),
  ('Limpeza', 'Limpeza', '', 2, true),
  ('Portaria', 'Portaria', '', 2, true),
  ('Obras', 'Engenharia', '', 5, true),
  ('Prestadores de Serviço', 'Administrativo', '', 4, true),
  ('Outros', 'Administrativo', '', 3, true)
on conflict (nome) do update set
  setor_responsavel = excluded.setor_responsavel,
  prazo_dias = excluded.prazo_dias,
  ativo = true,
  updated_at = now();

-- ============================================================
-- 10. VERIFICAÇÃO FINAL
-- Após executar, rode este SELECT para confirmar:
-- select table_name from information_schema.tables
-- where table_schema = 'public'
-- and table_name in (
--   'ocorrencia_categorias',
--   'ocorrencias',
--   'ocorrencia_historico',
--   'ocorrencia_comentarios',
--   'ocorrencia_anexos'
-- )
-- order by table_name;
-- ============================================================
