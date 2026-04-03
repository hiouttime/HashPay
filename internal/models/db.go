package models

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	*sql.DB
	driver string
}

func Open(driver, dsn string) (*DB, error) {
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &DB{DB: db, driver: driver}, nil
}

func (db *DB) Migrate() error {
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version BIGINT PRIMARY KEY,
			name VARCHAR(191) NOT NULL,
			applied_at BIGINT NOT NULL
		)
	`); err != nil {
		return err
	}

	rows, err := db.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return err
	}
	defer rows.Close()

	done := map[int64]bool{}
	for rows.Next() {
		var version int64
		if err := rows.Scan(&version); err != nil {
			return err
		}
		done[version] = true
	}
	for _, item := range migrations {
		if done[item.Version] {
			continue
		}
		if err := item.Up(db); err != nil {
			return fmt.Errorf("migrate %d %s: %w", item.Version, item.Name, err)
		}
		if _, err := db.Exec(
			`INSERT INTO schema_migrations(version, name, applied_at) VALUES(?, ?, ?)`,
			item.Version, item.Name, nowUnix(),
		); err != nil {
			return err
		}
	}
	return nil
}

type Models struct {
	db *DB
}

func New(db *DB) *Models {
	return &Models{db: db}
}

func (m *Models) Close() error {
	if m == nil || m.db == nil {
		return nil
	}
	return m.db.Close()
}

func (m *Models) DB() *DB {
	return m.db
}

func nowUnix() int64 {
	return time.Now().Unix()
}

func timePtr(v int64) time.Time {
	if v <= 0 {
		return time.Time{}
	}
	return time.Unix(v, 0)
}

func unixTime(v time.Time) int64 {
	if v.IsZero() {
		return 0
	}
	return v.Unix()
}

func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
