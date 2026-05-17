-- CORREÇÃO / ATUALIZAÇÃO DO CADASTRO DE MORADORES
-- Execute no Supabase > SQL Editor se o banco já existir.

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists unidade text;
alter table public.profiles add column if not exists condominio_id uuid references public.condominios(id) on delete set null;
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists celular text;
alter table public.profiles add column if not exists placa_veiculo text;
alter table public.profiles add column if not exists foto_placa_veiculo_url text;
alter table public.profiles add column if not exists pessoas_moram_junto jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists ativo boolean not null default true;

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_condominio on public.profiles(condominio_id);
create index if not exists idx_profiles_pessoas_moram_junto on public.profiles using gin(pessoas_moram_junto);
