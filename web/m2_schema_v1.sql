-- Courier Forecast M2 schema v1. Packaged as asset, executed by native SQLiteOpenHelper.
-- All datetime fields are ISO8601 UTC, civil dates are yyyy-mm-dd with explicit zone in evidence.
-- Unknown is NULL, never 0; monetary values are integer kopecks, not SQLite REAL.

CREATE TABLE legacy_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  schema_version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  mirrored_at TEXT NOT NULL
);

CREATE TABLE import_sources (
  id TEXT PRIMARY KEY NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256)=64),
  source_uri TEXT,
  source_kind TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE legacy_slot_facts (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  order_count INTEGER CHECK(order_count IS NULL OR order_count>=0),
  accounted_hundredths INTEGER CHECK(accounted_hundredths IS NULL OR accounted_hundredths>=0),
  raw_json TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_legacy_slot_date ON legacy_slot_facts(date);

CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT,
  accepted_at TEXT,
  completed_at TEXT,
  merchant TEXT,
  yandex_order_id TEXT,
  reward_kopecks INTEGER CHECK(reward_kopecks IS NULL OR typeof(reward_kopecks)='integer'),
  source_id TEXT,
  source_kind TEXT NOT NULL,
  confidence TEXT NOT NULL,
  precision TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES import_sources(id)
);
CREATE INDEX ix_orders_date ON orders(date);

CREATE TABLE aggregate_order_counts (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  slot_id TEXT,
  order_count INTEGER CHECK(order_count IS NULL OR order_count>=0),
  reward_kopecks INTEGER CHECK(reward_kopecks IS NULL OR typeof(reward_kopecks)='integer'),
  source_id TEXT,
  source_kind TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES import_sources(id)
);
CREATE INDEX ix_aggregate_date ON aggregate_order_counts(date);

CREATE TABLE work_intervals (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  zone TEXT,
  state TEXT NOT NULL CHECK(state IN ('WORK','PAUSE','UNKNOWN')),
  active_minutes INTEGER CHECK(active_minutes IS NULL OR active_minutes>=0),
  source_id TEXT,
  source_kind TEXT NOT NULL,
  confidence TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES import_sources(id)
);
CREATE INDEX ix_work_date ON work_intervals(date);

CREATE TABLE period_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  orders INTEGER CHECK(orders IS NULL OR orders>=0),
  accounted_hundredths INTEGER CHECK(accounted_hundredths IS NULL OR accounted_hundredths>=0),
  precision TEXT NOT NULL DEFAULT 'displayed',
  source_id TEXT,
  source_kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES import_sources(id)
);

CREATE TABLE financial_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT,
  slot_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN
    ('reward','final_guarantee','tip','tax','park_commission','park_bonus','separate_bonus',
     'adjustment','cycle_premium','paid_amount')),
  amount_kopecks INTEGER CHECK(amount_kopecks IS NULL OR typeof(amount_kopecks)='integer'),
  gross_or_net TEXT NOT NULL DEFAULT 'unspecified',
  source_id TEXT,
  source_kind TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES import_sources(id)
);
CREATE INDEX ix_finance_date_kind ON financial_ledger(date,kind);

CREATE TABLE weather_observations (
  id TEXT PRIMARY KEY NOT NULL,
  for_date TEXT NOT NULL,
  for_hour TEXT,
  zone TEXT NOT NULL,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('forecast','observed')),
  temperature_tenths INTEGER,
  precipitation_tenths INTEGER,
  payload_json TEXT,
  source_kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE forecast_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  target_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model_version TEXT NOT NULL,
  training_cutoff TEXT NOT NULL,
  center_orders INTEGER CHECK(center_orders IS NULL OR center_orders>=0),
  lower_orders INTEGER CHECK(lower_orders IS NULL OR lower_orders>=0),
  upper_orders INTEGER CHECK(upper_orders IS NULL OR upper_orders>=0),
  confidence TEXT,
  comparable_n INTEGER,
  baseline_orders INTEGER,
  payload_json TEXT
);
CREATE TRIGGER tr_forecast_immutable_update BEFORE UPDATE ON forecast_snapshots
  BEGIN SELECT RAISE(ABORT,'immutable published forecast'); END;
CREATE TRIGGER tr_forecast_immutable_delete BEFORE DELETE ON forecast_snapshots
  BEGIN SELECT RAISE(ABORT,'immutable published forecast'); END;

CREATE TABLE forecast_evaluations (
  id TEXT PRIMARY KEY NOT NULL,
  forecast_id TEXT NOT NULL,
  fact_revision TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  factual_orders INTEGER,
  signed_error INTEGER,
  absolute_error INTEGER,
  interval_covers_fact INTEGER,
  payload_json TEXT,
  FOREIGN KEY(forecast_id) REFERENCES forecast_snapshots(id)
);
CREATE INDEX ix_forecast_eval_source ON forecast_evaluations(forecast_id);

CREATE TABLE model_registry (
  id TEXT PRIMARY KEY NOT NULL,
  version TEXT NOT NULL,
  trained_at TEXT NOT NULL,
  training_cutoff TEXT NOT NULL,
  validation_from TEXT,
  validation_to TEXT,
  mae_orders_tenths INTEGER,
  signed_bias_tenths INTEGER,
  baseline_mae_tenths INTEGER,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE extraction_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL CHECK(timestamp_ms>=0),
  frame_region_json TEXT,
  ocr_text TEXT,
  confidence REAL,
  related_record_id TEXT,
  parser_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES import_sources(id)
);

CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  happened_at TEXT NOT NULL,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT,
  source_kind TEXT NOT NULL,
  payload_json TEXT
);

-- Source-row archive: every observed historical Sheet row is retained before any
-- business normalization. Raw cell values/formula flags are never guessed away.
CREATE TABLE sheet_import_rows (
 id TEXT PRIMARY KEY NOT NULL,
 source_id TEXT NOT NULL,
 sheet_name TEXT NOT NULL,
 row_number INTEGER NOT NULL CHECK(row_number>=2),
 raw_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(source_id,sheet_name,row_number),
 FOREIGN KEY(source_id) REFERENCES import_sources(id)
);
CREATE INDEX ix_sheet_rows_sheet ON sheet_import_rows(source_id,sheet_name);

-- Non-prospective archive of historic spreadsheets. No training cutoff or
-- independently witnessed publication time: never invent one just to satisfy
-- forecast_snapshots. These entries must never be evaluated as online forecasts.
CREATE TABLE historical_forecasts (
 id TEXT PRIMARY KEY NOT NULL,
 source_id TEXT NOT NULL,
 row_number INTEGER NOT NULL CHECK(row_number>=2),
 target_date TEXT NOT NULL,
 window_label TEXT,
 center_orders INTEGER CHECK(center_orders IS NULL OR (typeof(center_orders)='integer' AND center_orders>=0)),
 lower_orders INTEGER CHECK(lower_orders IS NULL OR (typeof(lower_orders)='integer' AND lower_orders>=0)),
 upper_orders INTEGER CHECK(upper_orders IS NULL OR (typeof(upper_orders)='integer' AND upper_orders>=0)),
 claimed_publication TEXT,
 claimed_model TEXT,
 source_status TEXT NOT NULL CHECK(source_status IN('unverified_historical','reconstructed_publication')),
 record_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(source_id) REFERENCES import_sources(id),
 UNIQUE(source_id,row_number)
);
CREATE INDEX ix_historical_forecast_date ON historical_forecasts(target_date);
CREATE TRIGGER historical_forecasts_immutable_update BEFORE UPDATE ON historical_forecasts
 BEGIN SELECT RAISE(ABORT,'immutable imported historical forecast'); END;
CREATE TRIGGER historical_forecasts_immutable_delete BEFORE DELETE ON historical_forecasts
 BEGIN SELECT RAISE(ABORT,'immutable imported historical forecast'); END;

-- User financial rules are archived as text, not silently made effective
-- in the current live financial engine. Distinguish policy from paid money.
CREATE TABLE historical_rule_specs (
 id TEXT PRIMARY KEY NOT NULL,
 source_id TEXT NOT NULL,
 row_number INTEGER NOT NULL CHECK(row_number>=2),
 rule_label TEXT NOT NULL,
 rule_text TEXT,
 source_status TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(source_id) REFERENCES import_sources(id),
 UNIQUE(source_id,row_number)
);

-- Spreadsheet declarations are not evidence of a trained model, and do not
-- satisfy model_registry's independently verified training-cutoff contract.
CREATE TABLE historical_model_specs (
 id TEXT PRIMARY KEY NOT NULL,
 source_id TEXT NOT NULL,
 row_number INTEGER NOT NULL CHECK(row_number>=2),
 model_label TEXT NOT NULL,
 model_state TEXT,
 declared_version TEXT,
 source_status TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(source_id) REFERENCES import_sources(id),
 UNIQUE(source_id,row_number)
);
