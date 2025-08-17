-- users
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('EMPLOYER','FRONTDESK','ADMIN')) default 'EMPLOYER',
  name text,
  employer_id uuid,
  hotel_id uuid,
  created_at timestamptz default now()
);
create index if not exists idx_app_users_email on public.app_users (lower(email));

-- employers & hotels
create table if not exists public.employers (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  property_details jsonb
);

-- room requests
create table if not exists public.room_requests (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers(id),
  hotel_id uuid not null references public.hotels(id),
  stay_start date not null,
  stay_end date not null,
  headcount int not null check (headcount > 0),
  room_type_mix jsonb not null,      -- {"SINGLE":1,"DOUBLE":2}
  notes text,
  status text not null default 'SUBMITTED',
  created_at timestamptz default now()
);

-- audit log (simple)
create table if not exists public.event_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  obj_type text not null,
  obj_id uuid,
  ts timestamptz default now(),
  payload jsonb
);
