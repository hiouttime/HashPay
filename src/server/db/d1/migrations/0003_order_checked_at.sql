ALTER TABLE orders ADD COLUMN checked_at INTEGER;

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);
CREATE INDEX IF NOT EXISTS orders_paid_at_idx ON orders(status, paid_at);
CREATE INDEX IF NOT EXISTS notify_order_idx ON notify(order_id);
