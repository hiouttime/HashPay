package test

import (
	"testing"

	cfgpkg "hashpay/internal/config"
)

func TestDSNPrefersMySQL(t *testing.T) {
	cfg := &cfgpkg.Config{
		Database: cfgpkg.DatabaseConfig{
			Type:   "sqlite",
			SQLite: cfgpkg.SQLiteConfig{Path: "./data/hashpay.db"},
			MySQL: cfgpkg.MySQLConfig{
				Host:     "127.0.0.1",
				Port:     3306,
				Database: "hashpay",
				Username: "root",
				Password: "secret",
			},
		},
	}

	driver, dsn := cfg.DSN()
	if driver != "mysql" {
		t.Fatalf("expected mysql driver, got %s", driver)
	}
	if dsn == "" {
		t.Fatalf("expected mysql dsn")
	}
}

func TestDSNFallsBackToSQLite(t *testing.T) {
	cfg := &cfgpkg.Config{
		Database: cfgpkg.DatabaseConfig{
			SQLite: cfgpkg.SQLiteConfig{Path: "./data/hashpay.db"},
		},
	}

	driver, dsn := cfg.DSN()
	if driver != "sqlite3" {
		t.Fatalf("expected sqlite3 driver, got %s", driver)
	}
	if dsn != "./data/hashpay.db" {
		t.Fatalf("unexpected sqlite dsn: %s", dsn)
	}
}
