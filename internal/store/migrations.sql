CREATE TABLE IF NOT EXISTS configs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    secret_key TEXT NOT NULL,
    callback_url TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_method_fields (
    method_id INTEGER NOT NULL,
    field_key TEXT NOT NULL,
    field_value TEXT NOT NULL,
    PRIMARY KEY (method_id, field_key),
    FOREIGN KEY (method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    merchant_order_no TEXT NOT NULL,
    source TEXT NOT NULL,
    customer_ref TEXT,
    fiat_amount REAL NOT NULL,
    fiat_currency TEXT NOT NULL,
    status TEXT NOT NULL,
    callback_url TEXT,
    redirect_url TEXT,
    tx_hash TEXT,
    notify_status TEXT,
    notify_error TEXT,
    notify_at INTEGER,
    expire_at INTEGER NOT NULL,
    paid_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_merchant_ref ON orders(merchant_id, merchant_order_no);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_expire_at ON orders(expire_at);

CREATE TABLE IF NOT EXISTS payment_routes (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    method_id INTEGER NOT NULL,
    driver TEXT NOT NULL,
    kind TEXT NOT NULL,
    network TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount REAL NOT NULL,
    address TEXT,
    account_name TEXT,
    memo TEXT,
    qr_value TEXT,
    instructions TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_routes_method ON payment_routes(method_id);

CREATE TABLE IF NOT EXISTS payment_txs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    method_id INTEGER NOT NULL,
    driver TEXT NOT NULL,
    network TEXT NOT NULL,
    currency TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    from_addr TEXT,
    to_addr TEXT,
    amount REAL NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_txs_order ON payment_txs(order_id);

CREATE TABLE IF NOT EXISTS notification_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_run_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_tasks_run ON notification_tasks(status, next_run_at);

CREATE TABLE IF NOT EXISTS job_cursors (
    cursor_key TEXT PRIMARY KEY,
    cursor_value INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
