-- Menu editing (Phase 1, S1).

-- Bumped on every menu change in the account (items, modifiers, branch overrides, stations),
-- so devices can download the menu only when it changed (ETag).
ALTER TABLE accounts ADD COLUMN menu_version bigint NOT NULL DEFAULT 1;

ALTER TABLE menu_categories ADD COLUMN archived_at timestamptz;
ALTER TABLE modifier_groups ADD COLUMN archived_at timestamptz;
ALTER TABLE stations ADD COLUMN archived_at timestamptz;

CREATE INDEX ON menu_categories (account_id);
CREATE INDEX ON modifier_groups (account_id);
CREATE INDEX ON modifier_options (group_id);
CREATE INDEX ON stations (branch_id);
