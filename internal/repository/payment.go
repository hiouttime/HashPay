package repository

import (
	"database/sql"
	"time"

	"hashpay/internal/model"
)

type PaymentRepo struct {
	db *DB
}

func NewPaymentRepo(db *DB) *PaymentRepo {
	return &PaymentRepo{db: db}
}

func (r *PaymentRepo) Create(p *model.Payment) error {
	query := `
		INSERT INTO payments (
			type, name, chain, currency, address, api_key, api_secret,
			enabled, config, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	enabled := 0
	if p.Enabled {
		enabled = 1
	}

	result, err := r.db.Exec(query,
		p.Type, p.Name, p.Chain, p.Currency, p.Address, p.APIKey, p.APISecret,
		enabled, p.Config, p.CreatedAt.Unix(), p.UpdatedAt.Unix(),
	)
	if err != nil {
		return err
	}

	id, _ := result.LastInsertId()
	p.ID = id
	return nil
}

func (r *PaymentRepo) GetByID(id int64) (*model.Payment, error) {
	query := `
		SELECT id, type, name, chain, currency, address, api_key, api_secret,
		       enabled, config, created_at, updated_at
		FROM payments WHERE id = ?
	`
	return r.scanPayment(r.db.QueryRow(query, id))
}

func (r *PaymentRepo) GetAll() ([]model.Payment, error) {
	query := `
		SELECT id, type, name, chain, currency, address, api_key, api_secret,
		       enabled, config, created_at, updated_at
		FROM payments
	`
	return r.queryPayments(query)
}

func (r *PaymentRepo) GetEnabled() ([]model.Payment, error) {
	query := `
		SELECT id, type, name, chain, currency, address, api_key, api_secret,
		       enabled, config, created_at, updated_at
		FROM payments WHERE enabled = 1
	`
	return r.queryPayments(query)
}

func (r *PaymentRepo) Update(p *model.Payment) error {
	query := `
		UPDATE payments SET
			type = ?, name = ?, chain = ?, currency = ?, address = ?,
			api_key = ?, api_secret = ?, enabled = ?, config = ?, updated_at = ?
		WHERE id = ?
	`

	enabled := 0
	if p.Enabled {
		enabled = 1
	}

	_, err := r.db.Exec(query,
		p.Type, p.Name, p.Chain, p.Currency, p.Address,
		p.APIKey, p.APISecret, enabled, p.Config, time.Now().Unix(),
		p.ID,
	)
	return err
}

func (r *PaymentRepo) Delete(id int64) error {
	_, err := r.db.Exec("DELETE FROM payments WHERE id = ?", id)
	return err
}

func (r *PaymentRepo) queryPayments(query string, args ...any) ([]model.Payment, error) {
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var payments []model.Payment
	for rows.Next() {
		p, err := r.scanPaymentRow(rows)
		if err != nil {
			return nil, err
		}
		payments = append(payments, *p)
	}
	return payments, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func (r *PaymentRepo) scanPayment(row *sql.Row) (*model.Payment, error) {
	return r.scanPaymentScanner(row)
}

func (r *PaymentRepo) scanPaymentRow(row *sql.Rows) (*model.Payment, error) {
	return r.scanPaymentScanner(row)
}

func (r *PaymentRepo) scanPaymentScanner(s scanner) (*model.Payment, error) {
	var p model.Payment
	var ptype string
	var name, chain, currency, address, apiKey, apiSecret, config sql.NullString
	var enabled int
	var createdAt, updatedAt int64

	err := s.Scan(
		&p.ID, &ptype, &name, &chain, &currency, &address,
		&apiKey, &apiSecret, &enabled, &config,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}

	p.Type = model.PaymentType(ptype)
	p.Name = name.String
	p.Chain = chain.String
	p.Currency = currency.String
	p.Address = address.String
	p.APIKey = apiKey.String
	p.APISecret = apiSecret.String
	p.Enabled = enabled == 1
	p.Config = config.String
	p.CreatedAt = time.Unix(createdAt, 0)
	p.UpdatedAt = time.Unix(updatedAt, 0)

	return &p, nil
}
