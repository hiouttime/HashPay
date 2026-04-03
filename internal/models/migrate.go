package models

import (
	"database/sql"
	"fmt"
)

type Migration struct {
	Version int64
	Name    string
	Up      func(db *DB) error
}

var migrations = []Migration{
	{
		Version: 1,
		Name:    "init",
		Up: func(db *DB) error {
			for _, stmt := range initTables(db.driver) {
				if _, err := db.Exec(stmt); err != nil {
					return err
				}
			}
			for _, item := range initIndexes() {
				if err := ensureIndex(db, item.table, item.name, item.columns, item.unique); err != nil {
					return err
				}
			}
			return nil
		},
	},
}

type indexDef struct {
	table   string
	name    string
	columns string
	unique  bool
}

func initTables(driver string) []string {
	idAuto := "INTEGER PRIMARY KEY AUTOINCREMENT"
	boolType := "INTEGER"
	floatType := "REAL"
	if driver == "mysql" {
		idAuto = "BIGINT PRIMARY KEY AUTO_INCREMENT"
		boolType = "TINYINT(1)"
		floatType = "DOUBLE"
	}

	return []string{
		`CREATE TABLE IF NOT EXISTS configs (
			key VARCHAR(191) PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at BIGINT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS merchants (
			id VARCHAR(64) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			api_key VARCHAR(191) NOT NULL UNIQUE,
			secret_key VARCHAR(255) NOT NULL,
			callback_url TEXT,
			status VARCHAR(32) NOT NULL,
			created_at BIGINT NOT NULL,
			updated_at BIGINT NOT NULL
		)`,
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS payment_methods (
			id %s,
			driver VARCHAR(64) NOT NULL,
			kind VARCHAR(32) NOT NULL,
			name VARCHAR(255) NOT NULL,
			enabled %s NOT NULL DEFAULT 1,
			created_at BIGINT NOT NULL,
			updated_at BIGINT NOT NULL
		)`, idAuto, boolType),
		`CREATE TABLE IF NOT EXISTS payment_method_fields (
			method_id BIGINT NOT NULL,
			field_key VARCHAR(191) NOT NULL,
			field_value TEXT NOT NULL,
			PRIMARY KEY (method_id, field_key),
			FOREIGN KEY (method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
		)`,
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS orders (
			id VARCHAR(64) PRIMARY KEY,
			merchant_id VARCHAR(64) NOT NULL,
			merchant_order_no VARCHAR(191) NOT NULL,
			source VARCHAR(32) NOT NULL,
			customer_ref VARCHAR(191),
			fiat_amount %s NOT NULL,
			fiat_currency VARCHAR(16) NOT NULL,
			status VARCHAR(32) NOT NULL,
			callback_url TEXT,
			redirect_url TEXT,
			tx_hash VARCHAR(191),
			notify_status VARCHAR(32),
			notify_error TEXT,
			notify_at BIGINT,
			expire_at BIGINT NOT NULL,
			paid_at BIGINT,
			created_at BIGINT NOT NULL,
			updated_at BIGINT NOT NULL
		)`, floatType),
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS payment_routes (
			id VARCHAR(64) PRIMARY KEY,
			order_id VARCHAR(64) NOT NULL UNIQUE,
			method_id BIGINT NOT NULL,
			driver VARCHAR(64) NOT NULL,
			kind VARCHAR(32) NOT NULL,
			network VARCHAR(64) NOT NULL,
			currency VARCHAR(16) NOT NULL,
			amount %s NOT NULL,
			address VARCHAR(255),
			account_name VARCHAR(255),
			memo VARCHAR(255),
			qr_value TEXT,
			instructions TEXT,
			created_at BIGINT NOT NULL,
			updated_at BIGINT NOT NULL,
			FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
			FOREIGN KEY (method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
		)`, floatType),
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS payment_txs (
			id %s,
			order_id VARCHAR(64) NOT NULL,
			route_id VARCHAR(64) NOT NULL,
			method_id BIGINT NOT NULL,
			driver VARCHAR(64) NOT NULL,
			network VARCHAR(64) NOT NULL,
			currency VARCHAR(16) NOT NULL,
			tx_hash VARCHAR(191) NOT NULL UNIQUE,
			from_addr VARCHAR(255),
			to_addr VARCHAR(255),
			amount %s NOT NULL,
			created_at BIGINT NOT NULL
		)`, idAuto, floatType),
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS notification_tasks (
			id %s,
			order_id VARCHAR(64) NOT NULL,
			status VARCHAR(32) NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0,
			last_error TEXT,
			next_run_at BIGINT NOT NULL,
			created_at BIGINT NOT NULL,
			updated_at BIGINT NOT NULL
		)`, idAuto),
		`CREATE TABLE IF NOT EXISTS job_cursors (
			cursor_key VARCHAR(191) PRIMARY KEY,
			cursor_value BIGINT NOT NULL,
			updated_at BIGINT NOT NULL
		)`,
	}
}

func initIndexes() []indexDef {
	return []indexDef{
		{table: "orders", name: "idx_orders_merchant_ref", columns: "merchant_id, merchant_order_no", unique: true},
		{table: "orders", name: "idx_orders_status", columns: "status"},
		{table: "orders", name: "idx_orders_expire_at", columns: "expire_at"},
		{table: "payment_routes", name: "idx_routes_method", columns: "method_id"},
		{table: "payment_txs", name: "idx_payment_txs_order", columns: "order_id"},
		{table: "notification_tasks", name: "idx_notification_tasks_run", columns: "status, next_run_at"},
	}
}

func ensureIndex(db *DB, table, name, columns string, unique bool) error {
	if db.driver == "mysql" {
		var exists string
		err := db.QueryRow(
			`SELECT INDEX_NAME FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
			table, name,
		).Scan(&exists)
		if err == nil {
			return nil
		}
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		query := fmt.Sprintf("CREATE %sINDEX %s ON %s(%s)", ifThen(unique, "UNIQUE ", ""), name, table, columns)
		_, err = db.Exec(query)
		return err
	}
	query := fmt.Sprintf("CREATE %sINDEX IF NOT EXISTS %s ON %s(%s)", ifThen(unique, "UNIQUE ", ""), name, table, columns)
	_, err := db.Exec(query)
	return err
}

func ifThen(ok bool, yes, no string) string {
	if ok {
		return yes
	}
	return no
}
