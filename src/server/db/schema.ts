export const requiredTables = ["configs", "merchants", "payments", "orders", "notify"] as const;

export const requiredColumns: Record<(typeof requiredTables)[number], readonly string[]> = {
  configs: ["key", "value", "blob_value", "updated_at"],
  merchants: ["id", "type", "name", "public_key", "callback_url", "status", "created_at", "updated_at"],
  notify: ["id", "order_id", "status", "attempts", "next_run_at", "last_error", "payload_json", "created_at", "updated_at"],
  orders: [
    "id",
    "merchant_id",
    "merchant_order_no",
    "description",
    "source",
    "status",
    "amount",
    "currency",
    "payway",
    "payment",
    "callback_url",
    "redirect_url",
    "customer_ref",
    "expire_at",
    "paid_at",
    "created_at",
    "updated_at",
  ],
  payments: ["id", "driver", "name", "enabled", "fields_json", "created_at", "updated_at"],
};

export const initSchemaSql = `
CREATE TABLE IF NOT EXISTS configs (
  key TEXT PRIMARY KEY,
  value TEXT,
  blob_value BLOB,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'website',
  name TEXT NOT NULL,
  public_key TEXT NOT NULL DEFAULT '',
  callback_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  fields_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  merchant_order_no TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  payway INTEGER,
  payment TEXT NOT NULL DEFAULT '{}',
  callback_url TEXT,
  redirect_url TEXT,
  customer_ref TEXT,
  expire_at INTEGER NOT NULL,
  paid_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(merchant_id, merchant_order_no)
);

CREATE TABLE IF NOT EXISTS notify (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL,
  last_error TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_expire_at_idx ON orders(expire_at);
CREATE INDEX IF NOT EXISTS orders_payway_idx ON orders(payway);
CREATE INDEX IF NOT EXISTS notify_status_next_idx ON notify(status, next_run_at);
`;

export const migrationSql = `
ALTER TABLE merchants ADD COLUMN type TEXT NOT NULL DEFAULT 'website';
ALTER TABLE merchants ADD COLUMN public_key TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN description TEXT;
UPDATE orders SET description = 'Telegram 内收款' WHERE source = 'telegram_inline' AND (description IS NULL OR description = '');
`;
