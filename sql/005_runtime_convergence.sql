WITH ranked_realized_profit_events AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY source_transaction_id
			ORDER BY created_at ASC, id ASC
		) AS duplicate_rank
	FROM realized_profit_events
)
DELETE FROM realized_profit_events
WHERE id IN (
	SELECT id
	FROM ranked_realized_profit_events
	WHERE duplicate_rank > 1
);

WITH ranked_position_state_events AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY source_transaction_id
			ORDER BY created_at ASC, id ASC
		) AS duplicate_rank
	FROM position_state_events
)
DELETE FROM position_state_events
WHERE id IN (
	SELECT id
	FROM ranked_position_state_events
	WHERE duplicate_rank > 1
);

WITH ranked_position_change_events AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY source_transaction_id
			ORDER BY (processed_at IS NOT NULL) DESC, created_at ASC, id ASC
		) AS duplicate_rank
	FROM position_change_events
)
DELETE FROM position_change_events
WHERE id IN (
	SELECT id
	FROM ranked_position_change_events
	WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_realized_profit_events_source_transaction
	ON realized_profit_events (source_transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_state_events_source_transaction
	ON position_state_events (source_transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_change_events_source_transaction
	ON position_change_events (source_transaction_id);
