package repository

import (
	"database/sql"
	"time"

	"hashpay/internal/model"
)

type OrderRepo struct {
	db *DB
}

func NewOrderRepo(db *DB) *OrderRepo {
	return &OrderRepo{db: db}
}

func (r *OrderRepo) Create(o *model.Order) error {
	query := `
		INSERT INTO orders (
			id, amount, currency, status, site_id, callback,
			expire_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.db.Exec(query,
		o.ID, o.Amount, o.Currency, o.Status, o.SiteID, o.Callback,
		o.ExpireAt.Unix(), o.CreatedAt.Unix(), o.UpdatedAt.Unix(),
	)
	return err
}

func (r *OrderRepo) GetByID(id string) (*model.Order, error) {
	query := `
		SELECT id, amount, currency, pay_currency, pay_amount, pay_addr,
		       pay_chain, pay_method, tx_hash, status, site_id, callback,
		       expire_at, paid_at, created_at, updated_at
		FROM orders WHERE id = ?
	`

	var o model.Order
	var payCurrency, payAddr, payChain, payMethod, txHash, siteID, callback sql.NullString
	var payAmount sql.NullFloat64
	var paidAt sql.NullInt64
	var expireAt, createdAt, updatedAt int64
	var status int

	err := r.db.QueryRow(query, id).Scan(
		&o.ID, &o.Amount, &o.Currency, &payCurrency, &payAmount, &payAddr,
		&payChain, &payMethod, &txHash, &status, &siteID, &callback,
		&expireAt, &paidAt, &createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}

	o.PayCurrency = payCurrency.String
	o.PayAmount = payAmount.Float64
	o.PayAddr = payAddr.String
	o.PayChain = payChain.String
	o.PayMethod = payMethod.String
	o.TxHash = txHash.String
	o.Status = model.OrderStatus(status)
	o.SiteID = siteID.String
	o.Callback = callback.String
	o.ExpireAt = time.Unix(expireAt, 0)
	o.CreatedAt = time.Unix(createdAt, 0)
	o.UpdatedAt = time.Unix(updatedAt, 0)
	if paidAt.Valid {
		o.PaidAt = time.Unix(paidAt.Int64, 0)
	}

	return &o, nil
}

func (r *OrderRepo) UpdateStatus(id string, status model.OrderStatus, txHash string) error {
	now := time.Now().Unix()
	if status == model.OrderPaid {
		query := `
			UPDATE orders
			SET status = ?, tx_hash = ?, paid_at = ?, updated_at = ?
			WHERE id = ?
		`
		_, err := r.db.Exec(query, status, txHash, now, now, id)
		return err
	}

	query := `
		UPDATE orders
		SET status = ?, tx_hash = ?, updated_at = ?
		WHERE id = ?
	`
	_, err := r.db.Exec(query, status, txHash, now, id)
	return err
}

func (r *OrderRepo) ExpirePending(now int64) (int64, error) {
	query := `
		UPDATE orders
		SET status = ?, tx_hash = ?, updated_at = ?
		WHERE status = ? AND expire_at <= ?
	`
	result, err := r.db.Exec(query, model.OrderExpired, "", now, model.OrderPending, now)
	if err != nil {
		return 0, err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	return affected, nil
}

func (r *OrderRepo) UpdatePayment(id string, chain, currency, addr string, amount float64) error {
	now := time.Now().Unix()
	query := `
		UPDATE orders 
		SET pay_chain = ?, pay_currency = ?, pay_addr = ?, pay_amount = ?, updated_at = ?
		WHERE id = ?
	`
	_, err := r.db.Exec(query, chain, currency, addr, amount, now, id)
	return err
}

func (r *OrderRepo) ClearPayment(id string) error {
	now := time.Now().Unix()
	query := `
		UPDATE orders
		SET pay_chain = ?, pay_currency = ?, pay_addr = ?, pay_amount = NULL, pay_method = ?, updated_at = ?
		WHERE id = ?
	`
	_, err := r.db.Exec(query, "", "", "", "", now, id)
	return err
}

func (r *OrderRepo) RefreshExpire(id string, expireAt int64) error {
	now := time.Now().Unix()
	query := `
		UPDATE orders
		SET expire_at = ?, updated_at = ?
		WHERE id = ?
	`
	_, err := r.db.Exec(query, expireAt, now, id)
	return err
}

func (r *OrderRepo) GetPending() ([]model.Order, error) {
	now := time.Now().Unix()
	query := `
		SELECT id, amount, currency, pay_currency, pay_amount, pay_addr,
		       pay_chain, pay_method, tx_hash, status, site_id, callback,
		       expire_at, paid_at, created_at, updated_at
		FROM orders 
		WHERE status = 0 AND expire_at > ?
	`
	return r.queryOrders(query, now)
}

func (r *OrderRepo) GetAfter(timestamp time.Time) ([]model.Order, error) {
	query := `
		SELECT id, amount, currency, pay_currency, pay_amount, pay_addr,
		       pay_chain, pay_method, tx_hash, status, site_id, callback,
		       expire_at, paid_at, created_at, updated_at
		FROM orders WHERE created_at >= ?
	`
	return r.queryOrders(query, timestamp.Unix())
}

func (r *OrderRepo) GetAll() ([]model.Order, error) {
	query := `
		SELECT id, amount, currency, pay_currency, pay_amount, pay_addr,
		       pay_chain, pay_method, tx_hash, status, site_id, callback,
		       expire_at, paid_at, created_at, updated_at
		FROM orders
	`
	return r.queryOrders(query)
}

func (r *OrderRepo) queryOrders(query string, args ...any) ([]model.Order, error) {
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []model.Order
	for rows.Next() {
		var o model.Order
		var payCurrency, payAddr, payChain, payMethod, txHash, siteID, callback sql.NullString
		var payAmount sql.NullFloat64
		var paidAt sql.NullInt64
		var expireAt, createdAt, updatedAt int64
		var status int

		err := rows.Scan(
			&o.ID, &o.Amount, &o.Currency, &payCurrency, &payAmount, &payAddr,
			&payChain, &payMethod, &txHash, &status, &siteID, &callback,
			&expireAt, &paidAt, &createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}

		o.PayCurrency = payCurrency.String
		o.PayAmount = payAmount.Float64
		o.PayAddr = payAddr.String
		o.PayChain = payChain.String
		o.PayMethod = payMethod.String
		o.TxHash = txHash.String
		o.Status = model.OrderStatus(status)
		o.SiteID = siteID.String
		o.Callback = callback.String
		o.ExpireAt = time.Unix(expireAt, 0)
		o.CreatedAt = time.Unix(createdAt, 0)
		o.UpdatedAt = time.Unix(updatedAt, 0)
		if paidAt.Valid {
			o.PaidAt = time.Unix(paidAt.Int64, 0)
		}

		orders = append(orders, o)
	}

	return orders, nil
}
