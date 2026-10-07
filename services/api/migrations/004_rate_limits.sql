-- Fixed-window counters for sign-in, sign-up and pairing attempts. Kept in the database so
-- limits hold across API instances.
CREATE TABLE rate_limits (
  key           text PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL
);
CREATE INDEX ON rate_limits (window_start);
