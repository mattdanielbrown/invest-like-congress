ALTER TABLE filing_documents
	ADD COLUMN IF NOT EXISTS raw_cache_path text,
	ADD COLUMN IF NOT EXISTS raw_fetched_at timestamptz,
	ADD COLUMN IF NOT EXISTS raw_content_hash text,
	ADD COLUMN IF NOT EXISTS compliance_mode text;

ALTER TABLE normalized_transactions
	ADD COLUMN IF NOT EXISTS source_transaction_key text,
	ADD COLUMN IF NOT EXISTS parser_confidence numeric,
	ADD COLUMN IF NOT EXISTS extraction_mode text;

UPDATE normalized_transactions
SET
	source_transaction_key = COALESCE(
		source_transaction_key,
		md5(
			concat_ws(
				'|',
				member_id,
				asset_id,
				action,
				trade_date::text,
				filing_document_id,
				COALESCE(share_quantity::text, ''),
				COALESCE(price_per_share::text, '')
			)
		)
	),
	parser_confidence = COALESCE(parser_confidence, 0.5),
	extraction_mode = COALESCE(extraction_mode, 'metadata')
WHERE source_transaction_key IS NULL
	OR parser_confidence IS NULL
	OR extraction_mode IS NULL;

ALTER TABLE normalized_transactions
	ALTER COLUMN source_transaction_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_normalized_transactions_source_key
	ON normalized_transactions (source_transaction_key);

CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
	source_system text NOT NULL,
	cursor_key text NOT NULL,
	last_seen_filed_at date,
	last_run_at timestamptz,
	PRIMARY KEY (source_system, cursor_key)
);

CREATE TABLE IF NOT EXISTS raw_document_cache (
	id text PRIMARY KEY,
	source_system text NOT NULL,
	source_document_id text NOT NULL UNIQUE,
	cache_path text NOT NULL,
	content_hash text NOT NULL,
	fetched_at timestamptz NOT NULL,
	content_type text,
	content_length bigint,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_quarantine_events (
	id text PRIMARY KEY,
	source_document_id text NOT NULL,
	reason text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE source_attributions
	ADD COLUMN IF NOT EXISTS field_value text,
	ADD COLUMN IF NOT EXISTS source_location text,
	ADD COLUMN IF NOT EXISTS extractor_version text,
	ADD COLUMN IF NOT EXISTS confidence numeric;

UPDATE source_attributions
SET
	field_value = COALESCE(field_value, source_text),
	source_location = COALESCE(source_location, 'unknown'),
	extractor_version = COALESCE(extractor_version, 'v1'),
	confidence = COALESCE(confidence, 0.5)
WHERE field_value IS NULL
	OR source_location IS NULL
	OR extractor_version IS NULL
	OR confidence IS NULL;

ALTER TABLE source_attributions
	ALTER COLUMN extractor_version SET NOT NULL,
	ALTER COLUMN confidence SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_source_attributions_document
	ON source_attributions (filing_document_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_raw_document_cache_source
	ON raw_document_cache (source_system, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_checkpoints_run
	ON ingestion_checkpoints (source_system, last_run_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_quarantine_created
	ON ingestion_quarantine_events (created_at DESC);
