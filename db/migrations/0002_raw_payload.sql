-- Fallback home for unmodified upstream payloads when object storage is
-- unavailable (e.g. the Blob store's access mode rejects writes). The
-- raw_artifact row then carries storage_key = 'pg://raw_payload/<key>'.
-- Payloads are gzipped; byte_size records the ORIGINAL size.

create table raw_payload (
  id            uuid primary key default gen_random_uuid(),
  storage_key   text not null unique,
  payload       bytea not null,
  content_type  text not null,
  encoding      text not null default 'gzip',
  byte_size     bigint not null,
  received_at   timestamptz not null default now()
);
