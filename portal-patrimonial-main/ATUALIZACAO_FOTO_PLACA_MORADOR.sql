-- Atualização opcional para permitir imagem da placa do veículo do morador
alter table public.profiles
add column if not exists foto_placa_veiculo_url text;
