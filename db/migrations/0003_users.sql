-- Phase: user module. Accounts and server-side plan storage so a plan
-- survives any device, not just one browser's localStorage.
--
-- Deletion note: the archive-never-delete rule protects MARKET data. User
-- rows are personal data; account deletion is a right and performs a hard
-- delete of the user and their plan, nothing else.

create table app_user (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  password_hash  text not null,
  created_at     timestamptz not null default now()
);

-- Case-insensitive uniqueness without the citext extension.
create unique index app_user_email_key on app_user (lower(email));

create table user_plan (
  user_id     uuid primary key references app_user (id) on delete cascade,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);
