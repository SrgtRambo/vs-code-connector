-- Supabase schema for ForgeAI backend
create schema if not exists public;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  stripe_customer_id text
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  stripe_session_id text unique not null,
  product_id text,
  created_at timestamp with time zone default now(),
  fulfilled boolean default false,
  download_url text,
  prompt text,
  type text,
  license_key text
);

-- Storage bucket "projects" will be created in Supabase UI (or via API).
