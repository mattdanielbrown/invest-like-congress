CREATE INDEX IF NOT EXISTS idx_normalized_transactions_member_date ON normalized_transactions (member_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_transactions_asset_date ON normalized_transactions (asset_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_holding_snapshots_member ON holding_snapshots (member_id);
CREATE INDEX IF NOT EXISTS idx_holding_snapshots_asset ON holding_snapshots (asset_id);
CREATE INDEX IF NOT EXISTS idx_position_change_events_processed ON position_change_events (processed_at, created_at);
CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_verified ON alert_subscriptions (is_verified, unsubscribed_at);
