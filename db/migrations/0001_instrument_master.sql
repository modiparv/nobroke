-- Phase 1: instrument master and prices.
--
-- Conventions for this layer:
--   * uuid primary keys, timestamptz timestamps
--   * money is numeric, never float: unit prices to 4dp, amounts to 2dp
--   * archive, never delete: no statement in this layer ever issues DELETE
--   * re-runs are idempotent via the unique keys below

create extension if not exists pgcrypto;

create type source_kind as enum ('prices', 'statements', 'reference');
create type sync_status as enum ('running', 'success', 'failed');
create type listing_status as enum ('listed', 'unlisted', 'delisted', 'suspended');
create type asset_class as enum ('equity', 'debt', 'gold', 'silver', 'hybrid', 'cash', 'real_estate', 'other');
create type instrument_type as enum ('mutual_fund', 'etf', 'stock', 'bond', 'sgb', 'fd', 'epf', 'ppf', 'nps', 'physical', 'other');

-- Tax treatment is deliberately its own enum and is never derived from
-- asset_class: gold ETF, gold fund, physical gold and SGB are one asset class
-- and four tax treatments. Dated rules (rates, cutovers such as debt MF
-- 2023-04-01) belong in rule tables keyed by these values, not in code.
create type tax_regime_key as enum (
  'EQUITY_MF', 'EQUITY_LISTED', 'DEBT_MF', 'GOLD_ETF', 'GOLD_FUND',
  'PHYSICAL_GOLD', 'SGB', 'FD_INTEREST', 'EPF', 'PPF', 'NPS', 'OTHER'
);

create type liquidity_tier as enum ('t0', 't1', 't3', 'locked', 'illiquid');
create type risk_band as enum ('low', 'moderate', 'high');

create table data_source (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  kind             source_kind not null,
  base_url         text,
  refresh_cadence  text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table sync_run (
  id              uuid primary key default gen_random_uuid(),
  data_source_id  uuid not null references data_source (id),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          sync_status not null default 'running',
  rows_ingested   integer not null default 0,
  rows_skipped    integer not null default 0,
  error_text      text
);

create index sync_run_source_started_idx on sync_run (data_source_id, started_at desc);

-- ingest_job_id becomes a foreign key when the ingest_job table lands in
-- Phase 2; the column exists now so raw artifacts from either path share one
-- table from day one.
create table raw_artifact (
  id             uuid primary key default gen_random_uuid(),
  sync_run_id    uuid references sync_run (id),
  ingest_job_id  uuid,
  storage_key    text not null unique,
  mime_type      text not null,
  byte_size      bigint not null,
  received_at    timestamptz not null default now(),
  check (sync_run_id is not null or ingest_job_id is not null)
);

create table instrument (
  id              uuid primary key default gen_random_uuid(),
  isin            text,
  amfi_code       text,
  symbol          text,
  exchange        text,
  name            text not null,
  asset_class     asset_class not null,
  instrument_type instrument_type not null,
  tax_regime_key  tax_regime_key not null,
  liquidity_tier  liquidity_tier not null default 't3',
  risk_band       risk_band,
  currency        text not null default 'INR',
  listing_status  listing_status not null default 'listed',
  needs_review    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Regular and Direct plans have different ISINs and must never be merged;
-- Growth and IDCW likewise. Uniqueness on ISIN is what enforces that here.
create unique index instrument_isin_key on instrument (isin) where isin is not null;
-- One AMFI scheme code can cover a payout and a reinvestment ISIN. The code
-- lives on the primary (growth / payout) variant; the sibling carries null.
create unique index instrument_amfi_code_key on instrument (amfi_code) where amfi_code is not null;

create table price_quote (
  id             uuid primary key default gen_random_uuid(),
  instrument_id  uuid not null references instrument (id),
  as_of          date not null,
  price          numeric(20, 4) not null,
  source         text not null,
  is_stale       boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (instrument_id, as_of, source)
);

create index price_quote_latest_idx on price_quote (instrument_id, as_of desc);

create table composition (
  id             uuid primary key default gen_random_uuid(),
  instrument_id  uuid not null references instrument (id),
  as_of          date not null,
  sleeve         text not null,
  weight_pct     numeric(7, 4) not null,
  unique (instrument_id, as_of, sleeve)
);

create table corporate_action (
  id             uuid primary key default gen_random_uuid(),
  instrument_id  uuid not null references instrument (id),
  action_type    text not null,
  ratio          numeric(20, 8),
  record_date    date not null,
  applied_at     timestamptz
);
