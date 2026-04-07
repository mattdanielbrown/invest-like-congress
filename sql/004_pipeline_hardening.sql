DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'fk_normalized_transactions_filing_document_id'
	) THEN
		ALTER TABLE normalized_transactions
			ADD CONSTRAINT fk_normalized_transactions_filing_document_id
			FOREIGN KEY (filing_document_id)
			REFERENCES filing_documents(source_document_id)
			ON DELETE RESTRICT
			NOT VALID;
	END IF;
END $$;

ALTER TABLE normalized_transactions
	VALIDATE CONSTRAINT fk_normalized_transactions_filing_document_id;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'chk_normalized_transactions_parser_confidence'
	) THEN
		ALTER TABLE normalized_transactions
			ADD CONSTRAINT chk_normalized_transactions_parser_confidence
			CHECK (
				parser_confidence IS NOT NULL
				AND parser_confidence >= 0
				AND parser_confidence <= 1
			);
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'chk_normalized_transactions_extraction_mode'
	) THEN
		ALTER TABLE normalized_transactions
			ADD CONSTRAINT chk_normalized_transactions_extraction_mode
			CHECK (extraction_mode IN ('html', 'pdf-text', 'metadata'));
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS ingestion_run_summaries (
	run_id text PRIMARY KEY,
	mode text NOT NULL CHECK (mode IN ('backfill', 'hourly')),
	source_system text NOT NULL,
	cursor_key text NOT NULL,
	from_year int NOT NULL,
	to_year int NOT NULL,
	started_at timestamptz NOT NULL,
	finished_at timestamptz,
	success boolean NOT NULL DEFAULT false,
	failure_reason text,
	fetched_documents int NOT NULL DEFAULT 0,
	parsed_documents int NOT NULL DEFAULT 0,
	quarantined_documents int NOT NULL DEFAULT 0,
	extracted_transactions int NOT NULL DEFAULT 0,
	provenance_coverage_ratio numeric NOT NULL DEFAULT 0,
	warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_run_summaries_latest
	ON ingestion_run_summaries (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_run_summaries_cursor
	ON ingestion_run_summaries (source_system, cursor_key, started_at DESC);

