package models

import "strings"

func (m *Models) GetConfig(key, fallback string) string {
	var value string
	err := m.db.QueryRow("SELECT value FROM configs WHERE key = ?", strings.TrimSpace(key)).Scan(&value)
	if err != nil {
		return fallback
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func (m *Models) Configs() (map[string]string, error) {
	rows, err := m.db.Query("SELECT key, value FROM configs ORDER BY key")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]string{}
	for rows.Next() {
		var key string
		var value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		out[key] = value
	}
	return out, rows.Err()
}

func (m *Models) SetConfigs(values map[string]string) error {
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	ts := nowUnix()
	for key, value := range values {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, err := tx.Exec(`
			INSERT INTO configs(key, value, updated_at)
			VALUES(?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
		`, key, strings.TrimSpace(value), ts); err != nil {
			return err
		}
	}
	return tx.Commit()
}
