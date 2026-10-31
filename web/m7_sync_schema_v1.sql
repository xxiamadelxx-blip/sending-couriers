-- M7 keeps pending edits, last accepted remote versions, and unresolved
-- two-device conflicts. It contains no forecast, video, OCR, or token data.
CREATE INDEX IF NOT EXISTS ix_sync_queue_pending ON sync_queue(state,created_at);

CREATE TABLE IF NOT EXISTS m7_sync_heads (
 record_type TEXT NOT NULL,
 record_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('UPSERT','DELETE')),
 payload_json TEXT,
 payload_hash TEXT NOT NULL,
 event_id TEXT NOT NULL,
 remote_row INTEGER NOT NULL CHECK(remote_row>=0),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(record_type,record_id)
);

CREATE TABLE IF NOT EXISTS m7_sync_conflicts (
 id TEXT PRIMARY KEY NOT NULL,
 record_type TEXT NOT NULL,
 record_id TEXT NOT NULL,
 local_action TEXT NOT NULL CHECK(local_action IN ('UPSERT','DELETE')),
 local_payload_json TEXT,
 local_hash TEXT NOT NULL,
 remote_action TEXT NOT NULL CHECK(remote_action IN ('UPSERT','DELETE','MISSING')),
 remote_payload_json TEXT,
 remote_hash TEXT NOT NULL,
 remote_event_id TEXT,
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','local','remote')),
 created_at TEXT NOT NULL,
 resolved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_m7_open_conflict_record
 ON m7_sync_conflicts(record_type,record_id) WHERE state='open';

CREATE TABLE IF NOT EXISTS m7_sync_meta (
 key TEXT PRIMARY KEY NOT NULL,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
