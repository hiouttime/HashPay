package repository

import (
	"database/sql"
	"time"
)

type ConfigRepo struct {
	db *DB
}

func NewConfigRepo(db *DB) *ConfigRepo {
	return &ConfigRepo{db: db}
}

func (r *ConfigRepo) Get(key string) (string, error) {
	var value string
	err := r.db.QueryRow("SELECT value FROM configs WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (r *ConfigRepo) Set(key, value string) error {
	now := time.Now().Unix()

	if r.db.IsSQLite() {
		_, err := r.db.Exec(
			"INSERT OR REPLACE INTO configs (key, value, updated_at) VALUES (?, ?, ?)",
			key, value, now,
		)
		return err
	}

	_, err := r.db.Exec(
		`INSERT INTO configs (key, value, updated_at) VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
		key, value, now,
	)
	return err
}

func (r *ConfigRepo) GetAll() (map[string]string, error) {
	rows, err := r.db.Query("SELECT key, value FROM configs")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	configs := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		configs[key] = value
	}
	return configs, nil
}

func (r *ConfigRepo) Delete(key string) error {
	_, err := r.db.Exec("DELETE FROM configs WHERE key = ?", key)
	return err
}
