-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    id          TEXT PRIMARY KEY,
    amount      DECIMAL(20,8) NOT NULL,
    currency    TEXT NOT NULL,
    pay_currency TEXT,
    pay_amount  DECIMAL(20,8),
    pay_addr    TEXT,
    pay_chain   TEXT,
    pay_method  TEXT,
    tx_hash     TEXT,
    status      INTEGER DEFAULT 0,
    site_id     TEXT,
    callback    TEXT,
    expire_at   INTEGER NOT NULL,
    paid_at     INTEGER,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_expire ON orders(expire_at);
CREATE INDEX idx_orders_pay_addr ON orders(pay_addr);
CREATE INDEX idx_orders_site ON orders(site_id);

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id       INTEGER UNIQUE NOT NULL,
    username    TEXT,
    is_admin    INTEGER DEFAULT 0,
    pref_pay    TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_users_tg ON users(tg_id);
CREATE INDEX idx_users_admin ON users(is_admin);

-- 配置表
CREATE TABLE IF NOT EXISTS configs (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);

-- 支付方式表
CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    chain       TEXT,
    currency    TEXT,
    address     TEXT,
    api_key     TEXT,
    api_secret  TEXT,
    enabled     INTEGER DEFAULT 1,
    config      TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_payments_type ON payments(type);
CREATE INDEX idx_payments_enabled ON payments(enabled);

-- 站点表
CREATE TABLE IF NOT EXISTS sites (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    api_key     TEXT NOT NULL UNIQUE,
    callback    TEXT,
    notify      TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_sites_key ON sites(api_key);

-- 交易记录表
CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    TEXT NOT NULL,
    chain       TEXT NOT NULL,
    tx_hash     TEXT NOT NULL UNIQUE,
    from_addr   TEXT NOT NULL,
    to_addr     TEXT NOT NULL,
    amount      DECIMAL(20,8) NOT NULL,
    currency    TEXT NOT NULL,
    block_num   INTEGER,
    confirmed   INTEGER DEFAULT 0,
    raw_data    TEXT,
    created_at  INTEGER NOT NULL
);

CREATE INDEX idx_tx_order ON transactions(order_id);
CREATE INDEX idx_tx_hash ON transactions(tx_hash);
CREATE INDEX idx_tx_to ON transactions(to_addr);

-- 通知记录表
CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    TEXT NOT NULL,
    type        TEXT NOT NULL,
    target      TEXT NOT NULL,
    content     TEXT NOT NULL,
    status      INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    next_retry  INTEGER,
    created_at  INTEGER NOT NULL,
    sent_at     INTEGER
);

CREATE INDEX idx_notif_order ON notifications(order_id);
CREATE INDEX idx_notif_status ON notifications(status);
CREATE INDEX idx_notif_retry ON notifications(next_retry);