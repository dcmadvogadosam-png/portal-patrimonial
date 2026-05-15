-- Atualização para permitir foto opcional da placa do veículo do morador
-- Execute no Supabase > SQL Editor > New query > Run

alter table public.profiles
add column if not exists foto_placa_veiculo_url text;

create index if not exists idx_profiles_foto_placa_veiculo_url
on public.profiles(foto_placa_veiculo_url);

-- O bucket documentos já é usado pelo projeto.
-- Caso ainda não exista:
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do update set public = true;
