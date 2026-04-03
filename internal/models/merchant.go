package models

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

func (m *Models) ListMerchants() ([]Merchant, error) {
	rows, err := m.db.Query(`
		SELECT id, name, api_key, secret_key, callback_url, status, created_at, updated_at
		FROM merchants ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Merchant
	for rows.Next() {
		var item Merchant
		var createdAt int64
		var updatedAt int64
		if err := rows.Scan(&item.ID, &item.Name, &item.APIKey, &item.SecretKey, &item.CallbackURL, &item.Status, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item.CreatedAt = timePtr(createdAt)
		item.UpdatedAt = timePtr(updatedAt)
		list = append(list, item)
	}
	return list, rows.Err()
}

func (m *Models) GetMerchantByID(id string) (*Merchant, error) {
	var item Merchant
	var createdAt int64
	var updatedAt int64
	err := m.db.QueryRow(`
		SELECT id, name, api_key, secret_key, callback_url, status, created_at, updated_at
		FROM merchants WHERE id = ?
	`, strings.TrimSpace(id)).Scan(&item.ID, &item.Name, &item.APIKey, &item.SecretKey, &item.CallbackURL, &item.Status, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	item.CreatedAt = timePtr(createdAt)
	item.UpdatedAt = timePtr(updatedAt)
	return &item, nil
}

func (m *Models) GetMerchantByAPIKey(apiKey string) (*Merchant, error) {
	var item Merchant
	var createdAt int64
	var updatedAt int64
	err := m.db.QueryRow(`
		SELECT id, name, api_key, secret_key, callback_url, status, created_at, updated_at
		FROM merchants WHERE api_key = ?
	`, strings.TrimSpace(apiKey)).Scan(&item.ID, &item.Name, &item.APIKey, &item.SecretKey, &item.CallbackURL, &item.Status, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	item.CreatedAt = timePtr(createdAt)
	item.UpdatedAt = timePtr(updatedAt)
	return &item, nil
}

func (m *Models) SaveMerchant(item *Merchant) error {
	if item == nil {
		return fmt.Errorf("merchant is nil")
	}
	now := nowUnix()
	if strings.TrimSpace(item.ID) == "" {
		id, err := newID("M", 5)
		if err != nil {
			return err
		}
		item.ID = id
	}
	if strings.TrimSpace(item.APIKey) == "" {
		key, err := newID("ak_", 12)
		if err != nil {
			return err
		}
		item.APIKey = key
	}
	if strings.TrimSpace(item.SecretKey) == "" {
		key, err := newID("sk_", 16)
		if err != nil {
			return err
		}
		item.SecretKey = key
	}
	if strings.TrimSpace(item.Status) == "" {
		item.Status = "active"
	}

	var exists int
	err := m.db.QueryRow("SELECT 1 FROM merchants WHERE id = ? LIMIT 1", item.ID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = m.db.Exec(`
			INSERT INTO merchants(id, name, api_key, secret_key, callback_url, status, created_at, updated_at)
			VALUES(?, ?, ?, ?, ?, ?, ?, ?)
		`, item.ID, strings.TrimSpace(item.Name), item.APIKey, item.SecretKey, strings.TrimSpace(item.CallbackURL), item.Status, now, now)
		return err
	}
	if err != nil {
		return err
	}
	_, err = m.db.Exec(`
		UPDATE merchants
		SET name = ?, api_key = ?, secret_key = ?, callback_url = ?, status = ?, updated_at = ?
		WHERE id = ?
	`, strings.TrimSpace(item.Name), item.APIKey, item.SecretKey, strings.TrimSpace(item.CallbackURL), item.Status, now, item.ID)
	return err
}

func (m *Models) DeleteMerchant(id string) error {
	_, err := m.db.Exec("DELETE FROM merchants WHERE id = ?", strings.TrimSpace(id))
	return err
}
