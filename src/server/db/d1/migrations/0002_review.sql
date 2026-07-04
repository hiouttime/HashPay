CREATE TABLE IF NOT EXISTS review (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  answer TEXT NOT NULL,
  image BLOB,
  image_url TEXT
);

CREATE INDEX IF NOT EXISTS review_status_idx ON review(status);
CREATE INDEX IF NOT EXISTS review_order_idx ON review(order_id);
