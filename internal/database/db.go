package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// DB 包装数据库连接，兼容 MySQL 和 SQLite
type DB struct {
	*sql.DB
	driver string // "mysql" 或 "sqlite3"
}

// NewDB 创建数据库连接
func NewDB(driver, dsn string) (*DB, error) {
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	
	return &DB{DB: db, driver: driver}, nil
}

// SetDriver 设置驱动类型
func (db *DB) SetDriver(driver string) {
	db.driver = driver
}

// 占位符处理 - SQLite 用 ?, MySQL 也用 ?
func (db *DB) placeholder(n int) string {
	placeholders := make([]string, n)
	for i := 0; i < n; i++ {
		placeholders[i] = "?"
	}
	return strings.Join(placeholders, ",")
}

// Order 订单结构
type Order struct {
	ID          string
	Amount      float64
	Currency    string
	PayCurrency sql.NullString
	PayAmount   sql.NullFloat64
	PayAddr     sql.NullString
	PayChain    sql.NullString
	PayMethod   sql.NullString
	TxHash      sql.NullString
	Status      sql.NullInt64
	SiteID      sql.NullString
	Callback    sql.NullString
	ExpireAt    int64
	PaidAt      sql.NullInt64
	CreatedAt   int64
	UpdatedAt   int64
}

// CreateOrder 创建订单
func (db *DB) CreateOrder(o *Order) error {
	query := `
		INSERT INTO orders (
			id, amount, currency, status, site_id, callback,
			expire_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	
	_, err := db.Exec(query,
		o.ID, o.Amount, o.Currency, o.Status, o.SiteID, o.Callback,
		o.ExpireAt, o.CreatedAt, o.UpdatedAt,
	)
	return err
}

// GetOrder 获取订单
func (db *DB) GetOrder(id string) (*Order, error) {
	query := `
		SELECT id, amount, currency, pay_currency, pay_amount, pay_addr,
		       pay_chain, pay_method, tx_hash, status, site_id, callback,
		       expire_at, paid_at, created_at, updated_at
		FROM orders WHERE id = ?
	`
	
	var o Order
	err := db.QueryRow(query, id).Scan(
		&o.ID, &o.Amount, &o.Currency, &o.PayCurrency, &o.PayAmount, &o.PayAddr,
		&o.PayChain, &o.PayMethod, &o.TxHash, &o.Status, &o.SiteID, &o.Callback,
		&o.ExpireAt, &o.PaidAt, &o.CreatedAt, &o.UpdatedAt,
	)
	
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("订单不存在")
	}
	return &o, err
}

// UpdateOrderStatus 更新订单状态
func (db *DB) UpdateOrderStatus(id string, status int64, txHash string) error {
	now := time.Now().Unix()
	query := `
		UPDATE orders 
		SET status = ?, tx_hash = ?, paid_at = ?, updated_at = ?
		WHERE id = ?
	`
	
	_, err := db.Exec(query, status, txHash, now, now, id)
	return err
}

// GetPendingOrders 获取待支付订单
func (db *DB) GetPendingOrders() ([]Order, error) {
	now := time.Now().Unix()
	query := `
		SELECT id, amount, currency, pay_currency, pay_amount, pay_addr,
		       pay_chain, pay_method, tx_hash, status, site_id, callback,
		       expire_at, paid_at, created_at, updated_at
		FROM orders 
		WHERE status = 0 AND expire_at > ?
	`
	
	rows, err := db.Query(query, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var orders []Order
	for rows.Next() {
		var o Order
		err := rows.Scan(
			&o.ID, &o.Amount, &o.Currency, &o.PayCurrency, &o.PayAmount, &o.PayAddr,
			&o.PayChain, &o.PayMethod, &o.TxHash, &o.Status, &o.SiteID, &o.Callback,
			&o.ExpireAt, &o.PaidAt, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	
	return orders, nil
}

// User 用户结构
type User struct {
	ID        int64
	TgID      int64
	Username  sql.NullString
	IsAdmin   sql.NullInt64
	PrefPay   sql.NullString
	CreatedAt int64
	UpdatedAt int64
}

// CreateUser 创建用户
func (db *DB) CreateUser(u *User) error {
	query := `
		INSERT INTO users (tg_id, username, is_admin, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`
	
	result, err := db.Exec(query,
		u.TgID, u.Username, u.IsAdmin, u.CreatedAt, u.UpdatedAt,
	)
	if err != nil {
		return err
	}
	
	id, _ := result.LastInsertId()
	u.ID = id
	return nil
}

// GetUser 获取用户
func (db *DB) GetUser(tgID int64) (*User, error) {
	query := `
		SELECT id, tg_id, username, is_admin, pref_pay, created_at, updated_at
		FROM users WHERE tg_id = ?
	`
	
	var u User
	err := db.QueryRow(query, tgID).Scan(
		&u.ID, &u.TgID, &u.Username, &u.IsAdmin, &u.PrefPay,
		&u.CreatedAt, &u.UpdatedAt,
	)
	
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("用户不存在")
	}
	return &u, err
}

// Config 配置项
type Config struct {
	Key       string
	Value     string
	UpdatedAt int64
}

// GetConfig 获取配置
func (db *DB) GetConfig(key string) (string, error) {
	query := `SELECT value FROM configs WHERE key = ?`
	
	var value string
	err := db.QueryRow(query, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

// SetConfig 设置配置
func (db *DB) SetConfig(key, value string) error {
	now := time.Now().Unix()
	
	// SQLite 用 INSERT OR REPLACE, MySQL 用 INSERT ... ON DUPLICATE KEY UPDATE
	var query string
	if db.driver == "sqlite3" {
		query = `INSERT OR REPLACE INTO configs (key, value, updated_at) VALUES (?, ?, ?)`
		_, err := db.Exec(query, key, value, now)
		return err
	} else {
		query = `INSERT INTO configs (key, value, updated_at) VALUES (?, ?, ?)
		         ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`
		_, err := db.Exec(query, key, value, now)
		return err
	}
}

// GetAllConfigs 获取所有配置
func (db *DB) GetAllConfigs() ([]Config, error) {
	query := `SELECT key, value, updated_at FROM configs`
	
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var configs []Config
	for rows.Next() {
		var c Config
		err := rows.Scan(&c.Key, &c.Value, &c.UpdatedAt)
		if err != nil {
			return nil, err
		}
		configs = append(configs, c)
	}
	
	return configs, nil
}

// Payment 支付方式
type Payment struct {
	ID        int64
	Type      string
	Chain     sql.NullString
	Currency  sql.NullString
	Address   sql.NullString
	ApiKey    sql.NullString
	ApiSecret sql.NullString
	Enabled   sql.NullInt64
	Config    sql.NullString
	CreatedAt int64
	UpdatedAt int64
}

// CreatePayment 创建支付方式
func (db *DB) CreatePayment(p *Payment) error {
	query := `
		INSERT INTO payments (
			type, chain, currency, address, api_key, api_secret,
			enabled, config, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	
	result, err := db.Exec(query,
		p.Type, p.Chain, p.Currency, p.Address, p.ApiKey, p.ApiSecret,
		p.Enabled, p.Config, p.CreatedAt, p.UpdatedAt,
	)
	if err != nil {
		return err
	}
	
	id, _ := result.LastInsertId()
	p.ID = id
	return nil
}

// GetAllPayments 获取所有支付方式
func (db *DB) GetAllPayments() ([]Payment, error) {
	query := `
		SELECT id, type, chain, currency, address, api_key, api_secret,
		       enabled, config, created_at, updated_at
		FROM payments
	`
	
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var payments []Payment
	for rows.Next() {
		var p Payment
		err := rows.Scan(
			&p.ID, &p.Type, &p.Chain, &p.Currency, &p.Address,
			&p.ApiKey, &p.ApiSecret, &p.Enabled, &p.Config,
			&p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		payments = append(payments, p)
	}
	
	return payments, nil
}

// GetEnabledPayments 获取启用的支付方式
func (db *DB) GetEnabledPayments() ([]Payment, error) {
	query := `
		SELECT id, type, chain, currency, address, api_key, api_secret,
		       enabled, config, created_at, updated_at
		FROM payments
		WHERE enabled = 1
	`
	
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var payments []Payment
	for rows.Next() {
		var p Payment
		err := rows.Scan(
			&p.ID, &p.Type, &p.Chain, &p.Currency, &p.Address,
			&p.ApiKey, &p.ApiSecret, &p.Enabled, &p.Config,
			&p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		payments = append(payments, p)
	}
	
	return payments, nil
}

// Site 站点
type Site struct {
	ID        string
	Name      string
	ApiKey    string
	Callback  sql.NullString
	Notify    sql.NullString
	CreatedAt int64
	UpdatedAt int64
}

// GetSiteByKey 通过 API Key 获取站点
func (db *DB) GetSiteByKey(apiKey string) (*Site, error) {
	query := `
		SELECT id, name, api_key, callback, notify, created_at, updated_at
		FROM sites WHERE api_key = ?
	`
	
	var s Site
	err := db.QueryRow(query, apiKey).Scan(
		&s.ID, &s.Name, &s.ApiKey, &s.Callback, &s.Notify,
		&s.CreatedAt, &s.UpdatedAt,
	)
	
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("站点不存在")
	}
	return &s, err
}

// Transaction 交易记录
type Transaction struct {
	ID        int64
	OrderID   string
	Chain     string
	TxHash    string
	FromAddr  string
	ToAddr    string
	Amount    float64
	Currency  string
	BlockNum  sql.NullInt64
	Confirmed sql.NullInt64
	RawData   sql.NullString
	CreatedAt int64
}

// CreateTransaction 创建交易记录
func (db *DB) CreateTransaction(t *Transaction) error {
	query := `
		INSERT INTO transactions (
			order_id, chain, tx_hash, from_addr, to_addr,
			amount, currency, block_num, confirmed, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	
	result, err := db.Exec(query,
		t.OrderID, t.Chain, t.TxHash, t.FromAddr, t.ToAddr,
		t.Amount, t.Currency, t.BlockNum, t.Confirmed, t.CreatedAt,
	)
	if err != nil {
		return err
	}
	
	id, _ := result.LastInsertId()
	t.ID = id
	return nil
}

// GetOrdersAfter 获取指定时间后的订单
func (db *DB) GetOrdersAfter(timestamp int64) ([]Order, error) {
	query := `
		SELECT id, amount, currency, pay_currency, pay_amount, pay_addr,
		       pay_chain, pay_method, tx_hash, status, site_id, callback,
		       expire_at, paid_at, created_at, updated_at
		FROM orders 
		WHERE created_at >= ?
	`
	
	rows, err := db.Query(query, timestamp)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var orders []Order
	for rows.Next() {
		var o Order
		err := rows.Scan(
			&o.ID, &o.Amount, &o.Currency, &o.PayCurrency, &o.PayAmount, &o.PayAddr,
			&o.PayChain, &o.PayMethod, &o.TxHash, &o.Status, &o.SiteID, &o.Callback,
			&o.ExpireAt, &o.PaidAt, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	
	return orders, nil
}

// GetAllOrders 获取所有订单
func (db *DB) GetAllOrders() ([]Order, error) {
	query := `
		SELECT id, amount, currency, pay_currency, pay_amount, pay_addr,
		       pay_chain, pay_method, tx_hash, status, site_id, callback,
		       expire_at, paid_at, created_at, updated_at
		FROM orders
	`
	
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var orders []Order
	for rows.Next() {
		var o Order
		err := rows.Scan(
			&o.ID, &o.Amount, &o.Currency, &o.PayCurrency, &o.PayAmount, &o.PayAddr,
			&o.PayChain, &o.PayMethod, &o.TxHash, &o.Status, &o.SiteID, &o.Callback,
			&o.ExpireAt, &o.PaidAt, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	
	return orders, nil
}