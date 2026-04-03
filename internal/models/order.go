package models

import (
	"fmt"
	"strings"
	"time"
)

func (m *Models) CreateOrder(item *Order) error {
	if item == nil {
		return nil
	}
	now := time.Now()
	if strings.TrimSpace(item.ID) == "" {
		item.ID = newOrderID()
	}
	if strings.TrimSpace(item.Status) == "" {
		item.Status = OrderPending
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = now
	}
	if item.UpdatedAt.IsZero() {
		item.UpdatedAt = now
	}
	if item.ExpireAt.IsZero() {
		item.ExpireAt = now.Add(30 * time.Minute)
	}
	_, err := m.db.Exec(`
		INSERT INTO orders(
			id, merchant_id, merchant_order_no, source, customer_ref, fiat_amount, fiat_currency, status,
			callback_url, redirect_url, tx_hash, notify_status, notify_error, notify_at, expire_at, paid_at, created_at, updated_at
		)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, item.ID, item.MerchantID, item.MerchantOrderNo, item.Source, item.CustomerRef, item.FiatAmount, strings.ToUpper(item.FiatCurrency), item.Status,
		strings.TrimSpace(item.CallbackURL), strings.TrimSpace(item.RedirectURL), strings.TrimSpace(item.TxHash),
		strings.TrimSpace(item.NotifyStatus), strings.TrimSpace(item.NotifyError), unixTime(item.NotifyAt), unixTime(item.ExpireAt),
		unixTime(item.PaidAt), unixTime(item.CreatedAt), unixTime(item.UpdatedAt))
	return err
}

func (m *Models) GetOrderByMerchantRef(merchantID, ref string) (*Order, error) {
	return m.orderByQuery(`
		SELECT id, merchant_id, merchant_order_no, source, customer_ref, fiat_amount, fiat_currency, status,
			callback_url, redirect_url, tx_hash, notify_status, notify_error, notify_at, expire_at, paid_at, created_at, updated_at
		FROM orders WHERE merchant_id = ? AND merchant_order_no = ?
	`, strings.TrimSpace(merchantID), strings.TrimSpace(ref))
}

func (m *Models) GetOrder(id string) (*Order, error) {
	item, err := m.orderByQuery(`
		SELECT id, merchant_id, merchant_order_no, source, customer_ref, fiat_amount, fiat_currency, status,
			callback_url, redirect_url, tx_hash, notify_status, notify_error, notify_at, expire_at, paid_at, created_at, updated_at
		FROM orders WHERE id = ?
	`, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	route, err := m.GetRouteByOrder(item.ID)
	if err == nil {
		item.Route = route
	}
	return item, nil
}

func (m *Models) ListOrders(limit int, status string) ([]Order, error) {
	args := []any{}
	query := `
		SELECT id, merchant_id, merchant_order_no, source, customer_ref, fiat_amount, fiat_currency, status,
			callback_url, redirect_url, tx_hash, notify_status, notify_error, notify_at, expire_at, paid_at, created_at, updated_at
		FROM orders
	`
	if strings.TrimSpace(status) != "" && status != "all" {
		query += " WHERE status = ?"
		args = append(args, strings.TrimSpace(status))
	}
	query += " ORDER BY created_at DESC"
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", limit)
	}
	rows, err := m.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Order
	for rows.Next() {
		var item Order
		var notifyAt, expireAt, paidAt, createdAt, updatedAt int64
		if err := rows.Scan(
			&item.ID, &item.MerchantID, &item.MerchantOrderNo, &item.Source, &item.CustomerRef, &item.FiatAmount, &item.FiatCurrency, &item.Status,
			&item.CallbackURL, &item.RedirectURL, &item.TxHash, &item.NotifyStatus, &item.NotifyError, &notifyAt, &expireAt, &paidAt, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		item.NotifyAt = timePtr(notifyAt)
		item.ExpireAt = timePtr(expireAt)
		item.PaidAt = timePtr(paidAt)
		item.CreatedAt = timePtr(createdAt)
		item.UpdatedAt = timePtr(updatedAt)
		list = append(list, item)
	}
	return list, rows.Err()
}

func (m *Models) MarkOrderPaid(orderID, txHash string) error {
	now := nowUnix()
	_, err := m.db.Exec(`
		UPDATE orders
		SET status = ?, tx_hash = ?, paid_at = ?, updated_at = ?
		WHERE id = ? AND status = ?
	`, OrderPaid, strings.TrimSpace(txHash), now, now, strings.TrimSpace(orderID), OrderPending)
	return err
}

func (m *Models) MarkOrderExpired(orderID string) error {
	_, err := m.db.Exec(`
		UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?
	`, OrderExpired, nowUnix(), strings.TrimSpace(orderID), OrderPending)
	return err
}

func (m *Models) ExpireOrders(now time.Time) (int64, error) {
	res, err := m.db.Exec(`
		UPDATE orders SET status = ?, updated_at = ? WHERE status = ? AND expire_at <= ?
	`, OrderExpired, now.Unix(), OrderPending, now.Unix())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (m *Models) UpdateOrderNotify(orderID, status, errText string) error {
	ts := nowUnix()
	_, err := m.db.Exec(`
		UPDATE orders SET notify_status = ?, notify_error = ?, notify_at = ?, updated_at = ? WHERE id = ?
	`, strings.TrimSpace(status), strings.TrimSpace(errText), ts, ts, strings.TrimSpace(orderID))
	return err
}

func (m *Models) orderByQuery(query string, args ...any) (*Order, error) {
	var item Order
	var notifyAt, expireAt, paidAt, createdAt, updatedAt int64
	err := m.db.QueryRow(query, args...).Scan(
		&item.ID, &item.MerchantID, &item.MerchantOrderNo, &item.Source, &item.CustomerRef, &item.FiatAmount, &item.FiatCurrency, &item.Status,
		&item.CallbackURL, &item.RedirectURL, &item.TxHash, &item.NotifyStatus, &item.NotifyError, &notifyAt, &expireAt, &paidAt, &createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}
	item.NotifyAt = timePtr(notifyAt)
	item.ExpireAt = timePtr(expireAt)
	item.PaidAt = timePtr(paidAt)
	item.CreatedAt = timePtr(createdAt)
	item.UpdatedAt = timePtr(updatedAt)
	return &item, nil
}
