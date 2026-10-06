-- Core schema. Built for many branches from day one (Master Plan §3).
-- Money is stored as bigint satang; rates as integer basis points (700 = 7%).

CREATE TABLE accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  uuid NOT NULL REFERENCES accounts(id),
  name                        text NOT NULL,
  tax_id                      text CHECK (tax_id ~ '^[0-9]{13}$'),
  -- Revenue Department branch number: '00000' is head office.
  tax_branch_code             text NOT NULL DEFAULT '00000' CHECK (tax_branch_code ~ '^[0-9]{5}$'),
  address                     text,
  vat_registered              boolean NOT NULL DEFAULT false,
  price_mode                  text NOT NULL DEFAULT 'VAT_INCLUDED' CHECK (price_mode IN ('VAT_INCLUDED', 'VAT_EXCLUDED')),
  vat_rate_bp                 integer NOT NULL DEFAULT 700 CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  service_charge_bp           integer NOT NULL DEFAULT 0 CHECK (service_charge_bp BETWEEN 0 AND 10000),
  service_charge_order_types  text[] NOT NULL DEFAULT ARRAY['DINE_IN'],
  rounding_increment          integer NOT NULL DEFAULT 1 CHECK (rounding_increment IN (1, 25, 100)),
  rounding_mode               text NOT NULL DEFAULT 'NEAREST' CHECK (rounding_mode IN ('NEAREST', 'DOWN', 'UP')),
  timezone                    text NOT NULL DEFAULT 'Asia/Bangkok',
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON branches (account_id);

-- ---------------------------------------------------------------- staff & permissions

CREATE TYPE staff_role AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN');

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id),
  name        text NOT NULL,
  email       text UNIQUE,                 -- owners and managers only (web dashboard)
  pin_hash    text,                        -- 4–6 digit PIN, hashed; used on shared devices
  role        staff_role NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON users (account_id);

CREATE TABLE user_branches (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

-- Every permission is a per-role setting the owner can change (spec: Users and roles).
-- 'APPROVAL' means the action needs a manager PIN on the device.
CREATE TABLE role_permissions (
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role        staff_role NOT NULL,
  permission  text NOT NULL,
  grant_level text NOT NULL CHECK (grant_level IN ('ALLOW', 'APPROVAL', 'DENY')),
  PRIMARY KEY (account_id, role, permission)
);

-- ---------------------------------------------------------------- devices & floor

CREATE TABLE devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     uuid NOT NULL REFERENCES branches(id),
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('POS', 'WAITER', 'KDS', 'KIOSK')),
  -- Lower number = preferred hub. Unique so the failover order is unambiguous.
  hub_priority  integer NOT NULL,
  token_hash    text,                      -- device credential for the sync API
  last_seen_at  timestamptz,
  retired_at    timestamptz,
  UNIQUE (branch_id, hub_priority)
);

CREATE TABLE stations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        uuid NOT NULL REFERENCES branches(id),
  name             text NOT NULL,              -- grill, wok, drinks, dessert
  yellow_after_s   integer NOT NULL DEFAULT 600,
  red_after_s      integer NOT NULL DEFAULT 900,
  printer_address  text,                       -- ESC/POS fallback
  CHECK (red_after_s > yellow_after_s)
);

CREATE TABLE zones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid NOT NULL REFERENCES branches(id),
  name       text NOT NULL,
  sort       integer NOT NULL DEFAULT 0
);

CREATE TABLE dining_tables (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id   uuid NOT NULL REFERENCES zones(id),
  label     text NOT NULL,
  seats     integer NOT NULL CHECK (seats > 0),
  grid_x    integer,
  grid_y    integer,
  qr_token  text UNIQUE,                       -- QR self-ordering (Phase 2)
  UNIQUE (zone_id, label)
);

-- ---------------------------------------------------------------- menu

CREATE TABLE menu_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id),
  name_th     text NOT NULL,
  name_en     text,
  sort        integer NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id),
  category_id        uuid REFERENCES menu_categories(id),
  name_th            text NOT NULL,
  name_en            text,
  base_price_satang  bigint NOT NULL CHECK (base_price_satang >= 0),
  photo_url          text,
  service_charge_exempt boolean NOT NULL DEFAULT false,
  archived_at        timestamptz
);
CREATE INDEX ON menu_items (account_id);

-- Per-branch overrides: price, availability and kitchen station.
CREATE TABLE menu_item_branches (
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  price_satang  bigint CHECK (price_satang >= 0),     -- NULL = use base price
  available     boolean NOT NULL DEFAULT true,
  station_id    uuid REFERENCES stations(id),
  PRIMARY KEY (menu_item_id, branch_id)
);

CREATE TABLE modifier_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id),
  name_th      text NOT NULL,
  name_en      text,
  min_choices  integer NOT NULL DEFAULT 0 CHECK (min_choices >= 0),
  max_choices  integer NOT NULL DEFAULT 1,
  CHECK (max_choices >= min_choices AND max_choices > 0)
);

CREATE TABLE modifier_options (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name_th       text NOT NULL,
  name_en       text,
  price_satang  bigint NOT NULL DEFAULT 0 CHECK (price_satang >= 0),
  sort          integer NOT NULL DEFAULT 0
);

CREATE TABLE menu_item_modifier_groups (
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_item_id, group_id)
);

-- ---------------------------------------------------------------- food cost (MVP: theoretical cost)

CREATE TABLE ingredients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id),
  name_th             text NOT NULL,
  name_en             text,
  base_unit           text NOT NULL CHECK (base_unit IN ('g', 'ml', 'piece')),
  -- Fractional satang allowed: 1 kg pork at 180 THB = 18 satang per g.
  cost_per_unit_satang numeric(14, 4) NOT NULL CHECK (cost_per_unit_satang >= 0)
);

-- Recipes are versioned so food cost of past sales uses the recipe in force at the time.
CREATE TABLE recipe_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id        uuid REFERENCES menu_items(id),
  modifier_option_id  uuid REFERENCES modifier_options(id),
  effective_from      timestamptz NOT NULL DEFAULT now(),
  CHECK ((menu_item_id IS NULL) <> (modifier_option_id IS NULL))
);

CREATE TABLE recipe_lines (
  recipe_version_id  uuid NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  ingredient_id      uuid NOT NULL REFERENCES ingredients(id),
  quantity           numeric(12, 3) NOT NULL CHECK (quantity > 0),   -- in the ingredient's base unit
  PRIMARY KEY (recipe_version_id, ingredient_id)
);

-- ---------------------------------------------------------------- sync log (cloud mirror)

-- The cloud's copy of each branch log; rules in @fcs/sync-core decideUpload().
CREATE TABLE branch_log_heads (
  branch_id         uuid PRIMARY KEY REFERENCES branches(id),
  ballot_term       integer,
  ballot_rank       integer,
  length            integer NOT NULL DEFAULT 0,
  last_accepted_at  timestamptz NOT NULL DEFAULT 'epoch'
);

CREATE TABLE branch_log (
  branch_id    uuid NOT NULL REFERENCES branches(id),
  idx          integer NOT NULL,
  event_id     text NOT NULL,
  ballot_term  integer NOT NULL,
  ballot_rank  integer NOT NULL,
  status       text NOT NULL CHECK (status IN ('ACCEPTED', 'REJECTED')),
  reason       text,
  event_type   text NOT NULL,
  device_id    text NOT NULL,
  staff_id     text,
  created_at   timestamptz NOT NULL,           -- device clock, display only
  event        jsonb NOT NULL,
  PRIMARY KEY (branch_id, idx),
  UNIQUE (branch_id, event_id)
);
CREATE INDEX ON branch_log (branch_id, event_type);

-- ---------------------------------------------------------------- tax documents

-- Gap-free document numbers that work offline: the cloud hands each device a block
-- of numbers ahead of time; the device issues them in order (Master Plan §3).
CREATE TABLE document_number_blocks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid NOT NULL REFERENCES branches(id),
  device_id    uuid NOT NULL REFERENCES devices(id),
  doc_type     text NOT NULL CHECK (doc_type IN ('RECEIPT', 'TAX_INVOICE_ABB', 'TAX_INVOICE_FULL', 'CREDIT_NOTE')),
  prefix       text NOT NULL,
  first_number bigint NOT NULL CHECK (first_number > 0),
  last_number  bigint NOT NULL,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (last_number >= first_number)
);
CREATE INDEX ON document_number_blocks (branch_id, doc_type, prefix, first_number);

-- ---------------------------------------------------------------- customers (PDPA)

CREATE TABLE customers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid NOT NULL REFERENCES accounts(id),
  name                   text,
  phone                  text,
  line_user_id           text,
  tax_id                 text CHECK (tax_id ~ '^[0-9]{13}$'),   -- for full tax invoices
  tax_branch_code        text,
  address                text,
  marketing_consent_at   timestamptz,
  consent_notice_version text,
  deleted_at             timestamptz,                            -- PDPA erasure request
  UNIQUE (account_id, phone),
  UNIQUE (account_id, line_user_id)
);
