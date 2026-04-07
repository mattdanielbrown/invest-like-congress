CREATE TABLE IF NOT EXISTS members (
	id text PRIMARY KEY,
	full_name text NOT NULL,
	party text NOT NULL,
	state_code text NOT NULL,
	chamber text NOT NULL CHECK (chamber IN ('house', 'senate')),
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
	id text PRIMARY KEY,
	display_name text NOT NULL,
	ticker_symbol text,
	asset_type text NOT NULL,
	is_symbol_resolved boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS filing_documents (
	id text PRIMARY KEY,
	source_system text NOT NULL,
	source_document_id text NOT NULL UNIQUE,
	document_url text NOT NULL,
	filed_at date NOT NULL,
	published_at timestamptz,
	verification_status text NOT NULL CHECK (verification_status IN ('verified', 'quarantined')),
	ingestion_checksum text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS normalized_transactions (
	id text PRIMARY KEY,
	member_id text NOT NULL REFERENCES members(id),
	asset_id text NOT NULL REFERENCES assets(id),
	action text NOT NULL CHECK (action IN ('buy', 'sell')),
	trade_date date NOT NULL,
	filing_date date NOT NULL,
	share_quantity numeric,
	price_per_share numeric,
	total_amount_min numeric,
	total_amount_max numeric,
	filing_document_id text NOT NULL,
	verification_status text NOT NULL CHECK (verification_status IN ('verified', 'quarantined')),
	quarantine_reason text,
	is_new_position boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_attributions (
	id text PRIMARY KEY,
	entity_type text NOT NULL,
	entity_id text NOT NULL,
	field_name text NOT NULL,
	filing_document_id text NOT NULL,
	source_text text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holding_snapshots (
	id text PRIMARY KEY,
	member_id text NOT NULL REFERENCES members(id),
	asset_id text NOT NULL REFERENCES assets(id),
	shares_held numeric NOT NULL,
	average_cost_basis_per_share numeric NOT NULL,
	last_market_price numeric,
	unrealized_profit_loss numeric,
	status text NOT NULL CHECK (status IN ('open', 'closed')),
	verification_status text NOT NULL CHECK (verification_status IN ('verified', 'quarantined')),
	verified_updated_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (member_id, asset_id)
);

CREATE TABLE IF NOT EXISTS realized_profit_events (
	id text PRIMARY KEY,
	member_id text NOT NULL REFERENCES members(id),
	asset_id text NOT NULL REFERENCES assets(id),
	source_transaction_id text NOT NULL REFERENCES normalized_transactions(id),
	realized_profit_loss numeric NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS position_state_events (
	id text PRIMARY KEY,
	source_transaction_id text NOT NULL REFERENCES normalized_transactions(id),
	position_status text NOT NULL CHECK (position_status IN ('open', 'closed')),
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_subscriptions (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	email_address text NOT NULL UNIQUE,
	is_verified boolean NOT NULL DEFAULT false,
	verification_token text NOT NULL,
	preference_json jsonb NOT NULL DEFAULT '{"memberIds":[],"assetIds":[]}'::jsonb,
	unsubscribed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS position_change_events (
	id text PRIMARY KEY,
	member_id text NOT NULL,
	asset_id text NOT NULL,
	action text NOT NULL,
	share_delta numeric NOT NULL,
	realized_profit_loss numeric,
	source_transaction_id text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS system_status (
	id int PRIMARY KEY,
	last_ingestion_at timestamptz,
	last_pricing_refresh_at timestamptz,
	next_pricing_refresh_at timestamptz,
	market_session_state text NOT NULL DEFAULT 'unknown'
);

INSERT INTO system_status (id, market_session_state)
VALUES (1, 'unknown')
ON CONFLICT (id) DO NOTHING;
