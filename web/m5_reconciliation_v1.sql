-- M5 source reconciliation. Raw tables retain every source row; these projections
-- expose only reconciled counts and suppress known duplicate event identities.
CREATE VIEW active_orders AS
WITH eligible AS (
 SELECT o.* FROM orders o LEFT JOIN import_sources s ON s.id=o.source_id
 WHERE o.source_kind<>'xlsx' OR s.status='mirrored'
)
SELECT o.* FROM eligible o
WHERE o.yandex_order_id IS NULL OR (
 NOT EXISTS (
  SELECT 1 FROM eligible b
  WHERE b.yandex_order_id=o.yandex_order_id
   AND (
    b.date IS NOT o.date
    OR (b.reward_kopecks IS NOT NULL AND o.reward_kopecks IS NOT NULL
        AND b.reward_kopecks<>o.reward_kopecks)
    OR (b.completed_at IS NOT NULL AND o.completed_at IS NOT NULL
        AND COALESCE(strftime('%Y-%m-%dT%H:%MZ',b.completed_at),b.completed_at)
            IS NOT COALESCE(strftime('%Y-%m-%dT%H:%MZ',o.completed_at),o.completed_at))
   )
 )
 AND NOT EXISTS (
  SELECT 1 FROM eligible b
  WHERE b.yandex_order_id=o.yandex_order_id
   AND (
    (b.confidence='confirmed' AND o.confidence<>'confirmed')
    OR (b.confidence=o.confidence AND b.completed_at IS NOT NULL AND o.completed_at IS NULL)
    OR (b.confidence=o.confidence AND (b.completed_at IS NOT NULL)=(o.completed_at IS NOT NULL)
        AND b.reward_kopecks IS NOT NULL AND o.reward_kopecks IS NULL)
    OR (b.confidence=o.confidence AND (b.completed_at IS NOT NULL)=(o.completed_at IS NOT NULL)
        AND (b.reward_kopecks IS NOT NULL)=(o.reward_kopecks IS NOT NULL) AND b.id<o.id)
   )
 )
);

CREATE VIEW active_aggregate_order_counts AS
WITH eligible AS (
 SELECT a.* FROM aggregate_order_counts a LEFT JOIN import_sources s ON s.id=a.source_id
 WHERE a.source_kind<>'xlsx' OR
  (s.status='mirrored' AND NOT EXISTS (
   SELECT 1 FROM aggregate_order_counts u
   WHERE u.source_kind='legacy_state' AND u.date=a.date
  ))
),
scope_conflicts AS (
 SELECT date,
  CASE WHEN slot_id IS NULL OR source_kind='legacy_state' THEN '' ELSE slot_id END AS scope_key
 FROM eligible
 WHERE order_count IS NOT NULL
 GROUP BY date,CASE WHEN slot_id IS NULL OR source_kind='legacy_state' THEN '' ELSE slot_id END
 HAVING COUNT(DISTINCT order_count)>1 OR COUNT(DISTINCT reward_kopecks)>1
),
scope_unknowns AS (
 SELECT DISTINCT date,
  CASE WHEN slot_id IS NULL OR source_kind='legacy_state' THEN '' ELSE slot_id END AS scope_key
 FROM eligible WHERE order_count IS NULL
),
safe_rows AS (
 SELECT a.* FROM eligible a
 WHERE a.order_count IS NOT NULL
  AND NOT EXISTS (
   SELECT 1 FROM scope_conflicts c
   WHERE c.date=a.date
    AND c.scope_key=CASE WHEN a.slot_id IS NULL OR a.source_kind='legacy_state' THEN '' ELSE a.slot_id END
  )
  AND NOT EXISTS (
   SELECT 1 FROM scope_unknowns u
   WHERE u.date=a.date
    AND u.scope_key=CASE WHEN a.slot_id IS NULL OR a.source_kind='legacy_state' THEN '' ELSE a.slot_id END
  )
),
deduped AS (
 SELECT a.* FROM safe_rows a
 WHERE NOT EXISTS (
  SELECT 1 FROM safe_rows b
  WHERE b.date=a.date
   AND CASE WHEN b.slot_id IS NULL OR b.source_kind='legacy_state' THEN '' ELSE b.slot_id END
       =CASE WHEN a.slot_id IS NULL OR a.source_kind='legacy_state' THEN '' ELSE a.slot_id END
   AND b.order_count=a.order_count
   AND (
    (b.confidence='confirmed' AND a.confidence<>'confirmed')
    OR (b.confidence=a.confidence AND b.reward_kopecks IS NOT NULL AND a.reward_kopecks IS NULL)
    OR (b.confidence=a.confidence AND b.reward_kopecks IS a.reward_kopecks AND b.id<a.id)
   )
 )
),
daily_evidence AS (
 SELECT DISTINCT date FROM eligible
 WHERE order_count IS NOT NULL AND (slot_id IS NULL OR source_kind='legacy_state')
),
daily_conflicts AS (
 SELECT DISTINCT date FROM scope_conflicts WHERE scope_key=''
),
daily_unknowns AS (
 SELECT DISTINCT date FROM scope_unknowns WHERE scope_key=''
),
slot_conflicts AS (
 SELECT DISTINCT date FROM scope_conflicts WHERE scope_key<>''
),
slot_unknowns AS (
 SELECT DISTINCT date FROM scope_unknowns WHERE scope_key<>''
),
daily_rows AS (
 SELECT d.* FROM deduped d
 WHERE d.slot_id IS NULL OR d.source_kind='legacy_state'
),
slot_rows AS (
 SELECT s.* FROM deduped s
 WHERE s.slot_id IS NOT NULL AND s.source_kind<>'legacy_state'
),
slot_rollup AS (
 SELECT date,SUM(order_count) AS slot_total,
        MIN(CASE WHEN confidence='confirmed' THEN 1 ELSE 0 END) AS all_confirmed
 FROM slot_rows GROUP BY date
),
daily_decision AS (
 SELECT d.date,
        CASE WHEN d.confidence='confirmed' THEN 1
             WHEN r.slot_total=d.order_count AND r.all_confirmed=1
                  AND NOT EXISTS(SELECT 1 FROM slot_conflicts c WHERE c.date=d.date)
                  AND NOT EXISTS(SELECT 1 FROM slot_unknowns u WHERE u.date=d.date) THEN 0
             ELSE 1 END AS use_daily
 FROM daily_rows d
 LEFT JOIN slot_rollup r ON r.date=d.date
)
SELECT s.* FROM slot_rows s
WHERE NOT EXISTS(SELECT 1 FROM daily_conflicts c WHERE c.date=s.date)
 AND NOT EXISTS(SELECT 1 FROM daily_unknowns u WHERE u.date=s.date)
 AND NOT EXISTS(SELECT 1 FROM slot_conflicts c WHERE c.date=s.date)
 AND NOT EXISTS(SELECT 1 FROM slot_unknowns u WHERE u.date=s.date)
 AND (
  NOT EXISTS(SELECT 1 FROM daily_evidence d WHERE d.date=s.date)
  OR EXISTS(SELECT 1 FROM daily_decision d WHERE d.date=s.date AND d.use_daily=0)
 )
UNION ALL
SELECT d.* FROM daily_rows d
WHERE NOT EXISTS(SELECT 1 FROM daily_conflicts c WHERE c.date=d.date)
 AND EXISTS(SELECT 1 FROM daily_decision c WHERE c.date=d.date AND c.use_daily=1);
