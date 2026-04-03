package models

import "strings"

func (m *Models) ListPaymentMethods() ([]PaymentMethod, error) {
	rows, err := m.db.Query(`
		SELECT id, driver, kind, name, enabled, created_at, updated_at
		FROM payment_methods ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []PaymentMethod
	for rows.Next() {
		var item PaymentMethod
		var enabled int
		var createdAt int64
		var updatedAt int64
		if err := rows.Scan(&item.ID, &item.Driver, &item.Kind, &item.Name, &enabled, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item.Enabled = enabled == 1
		item.CreatedAt = timePtr(createdAt)
		item.UpdatedAt = timePtr(updatedAt)
		item.Fields, err = m.paymentFields(item.ID)
		if err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

func (m *Models) GetPaymentMethod(id int64) (*PaymentMethod, error) {
	var item PaymentMethod
	var enabled int
	var createdAt int64
	var updatedAt int64
	err := m.db.QueryRow(`
		SELECT id, driver, kind, name, enabled, created_at, updated_at
		FROM payment_methods WHERE id = ?
	`, id).Scan(&item.ID, &item.Driver, &item.Kind, &item.Name, &enabled, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	item.Enabled = enabled == 1
	item.CreatedAt = timePtr(createdAt)
	item.UpdatedAt = timePtr(updatedAt)
	item.Fields, err = m.paymentFields(item.ID)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (m *Models) SavePaymentMethod(item *PaymentMethod) error {
	if item == nil {
		return nil
	}
	now := nowUnix()
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if item.ID == 0 {
		res, err := tx.Exec(`
			INSERT INTO payment_methods(driver, kind, name, enabled, created_at, updated_at)
			VALUES(?, ?, ?, ?, ?, ?)
		`, strings.TrimSpace(item.Driver), strings.TrimSpace(item.Kind), strings.TrimSpace(item.Name), boolInt(item.Enabled), now, now)
		if err != nil {
			return err
		}
		id, err := res.LastInsertId()
		if err != nil {
			return err
		}
		item.ID = id
	} else {
		if _, err := tx.Exec(`
			UPDATE payment_methods SET driver = ?, kind = ?, name = ?, enabled = ?, updated_at = ?
			WHERE id = ?
		`, strings.TrimSpace(item.Driver), strings.TrimSpace(item.Kind), strings.TrimSpace(item.Name), boolInt(item.Enabled), now, item.ID); err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM payment_method_fields WHERE method_id = ?", item.ID); err != nil {
			return err
		}
	}
	for key, value := range item.Fields {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, err := tx.Exec(`
			INSERT INTO payment_method_fields(method_id, field_key, field_value)
			VALUES(?, ?, ?)
		`, item.ID, key, strings.TrimSpace(value)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (m *Models) DeletePaymentMethod(id int64) error {
	_, err := m.db.Exec("DELETE FROM payment_methods WHERE id = ?", id)
	return err
}

func (m *Models) paymentFields(methodID int64) (map[string]string, error) {
	rows, err := m.db.Query("SELECT field_key, field_value FROM payment_method_fields WHERE method_id = ?", methodID)
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
