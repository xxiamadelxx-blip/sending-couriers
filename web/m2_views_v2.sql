-- M2 v2: source-version-aware read-only projections; retain past evidence.
CREATE VIEW IF NOT EXISTS active_orders AS
 SELECT o.* FROM orders o LEFT JOIN import_sources s ON s.id=o.source_id
 WHERE o.source_kind<>'xlsx' OR s.status='mirrored';

CREATE VIEW IF NOT EXISTS active_aggregate_order_counts AS
 SELECT a.* FROM aggregate_order_counts a LEFT JOIN import_sources s ON s.id=a.source_id
 WHERE a.source_kind<>'xlsx' OR
  (s.status='mirrored' AND NOT EXISTS (
   SELECT 1 FROM aggregate_order_counts u
   WHERE u.source_kind='legacy_state' AND u.date=a.date
  ));

CREATE VIEW IF NOT EXISTS active_financial_ledger AS
 SELECT f.* FROM financial_ledger f LEFT JOIN import_sources s ON s.id=f.source_id
 WHERE f.source_kind<>'xlsx' OR
  (s.status='mirrored' AND NOT EXISTS (
   SELECT 1 FROM financial_ledger u
   WHERE u.source_kind='legacy_state' AND u.date=f.date AND u.kind=f.kind
  ));

CREATE VIEW IF NOT EXISTS active_period_snapshots AS
 SELECT p.* FROM period_snapshots p JOIN import_sources s ON s.id=p.source_id
 WHERE s.status='mirrored';

CREATE VIEW IF NOT EXISTS active_historical_forecasts AS
 SELECT h.* FROM historical_forecasts h JOIN import_sources s ON s.id=h.source_id
 WHERE s.status='mirrored';

CREATE VIEW IF NOT EXISTS active_historical_rule_specs AS
 SELECT h.* FROM historical_rule_specs h JOIN import_sources s ON s.id=h.source_id
 WHERE s.status='mirrored';

CREATE VIEW IF NOT EXISTS active_historical_model_specs AS
 SELECT h.* FROM historical_model_specs h JOIN import_sources s ON s.id=h.source_id
 WHERE s.status='mirrored';
