package models

import (
	"database/sql"
	"errors"
	"time"
)

func (m *Models) SaveTx(item *PaymentTx) error {
	if item == nil {
		return nil
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = time.Now()
	}
	_, err := m.db.Exec(`
		INSERT INTO payment_txs(order_id, route_id, method_id, driver, network, currency, tx_hash, from_addr, to_addr, amount, created_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, item.OrderID, item.RouteID, item.MethodID, item.Driver, item.Network, item.Currency, item.TxHash, item.FromAddr, item.ToAddr, item.Amount, item.CreatedAt.Unix())
	return err
}

func (m *Models) HasTx(txHash string) (bool, error) {
	var id int64
	err := m.db.QueryRow("SELECT id FROM payment_txs WHERE tx_hash = ? LIMIT 1", txHash).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
