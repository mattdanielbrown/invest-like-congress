CREATE TABLE IF NOT EXISTS worker_run_summaries (
	run_id text PRIMARY KEY,
	worker_name text NOT NULL CHECK (worker_name IN ('pricing-refresh', 'alerts')),
	started_at timestamptz NOT NULL,
	finished_at timestamptz NOT NULL,
	success boolean NOT NULL DEFAULT false,
	failure_reason text,
	metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
	warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_run_summaries_latest
	ON worker_run_summaries (worker_name, started_at DESC);

ALTER TABLE position_change_events
	ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE position_change_events
	ADD COLUMN IF NOT EXISTS processing_run_id text;

ALTER TABLE position_change_events
	ADD COLUMN IF NOT EXISTS delivery_attempt_count int NOT NULL DEFAULT 0;

ALTER TABLE position_change_events
	ADD COLUMN IF NOT EXISTS last_delivery_error text;

CREATE INDEX IF NOT EXISTS idx_position_change_events_delivery_queue
	ON position_change_events (processed_at, processing_started_at, created_at)
	WHERE processed_at IS NULL;
