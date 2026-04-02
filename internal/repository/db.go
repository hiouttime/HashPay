package repository

import (
	"database/sql"
	_ "embed"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed migrations/init.sql
var initSQL string

// DB 数据库连接包装
type DB struct {
	*sql.DB
	driver string
}

// Open 打开数据库连接
func Open(driver, dsn string) (*DB, error) {
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

// Migrate 执行数据库迁移
func (db *DB) Migrate() error {
	if _, err := db.Exec(initSQL); err != nil {
		return err
	}
	return db.ensurePaymentsNameColumn()
}

func (db *DB) ensurePaymentsNameColumn() error {
	if _, err := db.Exec("SELECT name FROM payments LIMIT 1"); err == nil {
		return nil
	} else {
		msg := strings.ToLower(err.Error())
		if !strings.Contains(msg, "no such column") && !strings.Contains(msg, "unknown column") {
			return err
		}
	}

	if _, err := db.Exec("ALTER TABLE payments ADD COLUMN name TEXT"); err == nil {
		return nil
	} else {
		msg := strings.ToLower(err.Error())
		if strings.Contains(msg, "duplicate column") || strings.Contains(msg, "already exists") {
			return nil
		}
		return err
	}
}

// Driver 返回数据库驱动名称
func (db *DB) Driver() string {
	return db.driver
}

// IsSQLite 是否为 SQLite
func (db *DB) IsSQLite() bool {
	return db.driver == "sqlite3"
}
