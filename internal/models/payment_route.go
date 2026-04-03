package models

import "time"

func (m *Models) SaveRoute(route *PaymentRoute) error {
	if route == nil {
		return nil
	}
	now := time.Now()
	if route.ID == "" {
		route.ID = newRouteID()
	}
	if route.CreatedAt.IsZero() {
		route.CreatedAt = now
	}
	route.UpdatedAt = now

	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM payment_routes WHERE order_id = ?", route.OrderID); err != nil {
		return err
	}
	if _, err := tx.Exec(`
		INSERT INTO payment_routes(
			id, order_id, method_id, driver, kind, network, currency, amount, address, account_name, memo, qr_value, instructions, created_at, updated_at
		)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, route.ID, route.OrderID, route.MethodID, route.Driver, route.Kind, route.Network, route.Currency, route.Amount,
		route.Address, route.AccountName, route.Memo, route.QRValue, route.Instructions, route.CreatedAt.Unix(), route.UpdatedAt.Unix()); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE orders SET updated_at = ? WHERE id = ?`, now.Unix(), route.OrderID); err != nil {
		return err
	}
	return tx.Commit()
}

func (m *Models) GetRouteByOrder(orderID string) (*PaymentRoute, error) {
	var item PaymentRoute
	var createdAt, updatedAt int64
	err := m.db.QueryRow(`
		SELECT id, order_id, method_id, driver, kind, network, currency, amount, address, account_name, memo, qr_value, instructions, created_at, updated_at
		FROM payment_routes WHERE order_id = ?
	`, orderID).Scan(&item.ID, &item.OrderID, &item.MethodID, &item.Driver, &item.Kind, &item.Network, &item.Currency, &item.Amount,
		&item.Address, &item.AccountName, &item.Memo, &item.QRValue, &item.Instructions, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	item.CreatedAt = timePtr(createdAt)
	item.UpdatedAt = timePtr(updatedAt)
	return &item, nil
}

func (m *Models) ListPendingRoutes() ([]Order, error) {
	rows, err := m.db.Query(`
		SELECT o.id, o.merchant_id, o.merchant_order_no, o.source, o.customer_ref, o.fiat_amount, o.fiat_currency, o.status,
			o.callback_url, o.redirect_url, o.tx_hash, o.notify_status, o.notify_error, o.notify_at, o.expire_at, o.paid_at, o.created_at, o.updated_at,
			r.id, r.method_id, r.driver, r.kind, r.network, r.currency, r.amount, r.address, r.account_name, r.memo, r.qr_value, r.instructions, r.created_at, r.updated_at
		FROM orders o
		JOIN payment_routes r ON r.order_id = o.id
		WHERE o.status = ?
		ORDER BY o.created_at ASC
	`, OrderPending)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Order
	for rows.Next() {
		var item Order
		var route PaymentRoute
		var notifyAt, expireAt, paidAt, createdAt, updatedAt int64
		var routeCreatedAt, routeUpdatedAt int64
		if err := rows.Scan(
			&item.ID, &item.MerchantID, &item.MerchantOrderNo, &item.Source, &item.CustomerRef, &item.FiatAmount, &item.FiatCurrency, &item.Status,
			&item.CallbackURL, &item.RedirectURL, &item.TxHash, &item.NotifyStatus, &item.NotifyError, &notifyAt, &expireAt, &paidAt, &createdAt, &updatedAt,
			&route.ID, &route.MethodID, &route.Driver, &route.Kind, &route.Network, &route.Currency, &route.Amount, &route.Address, &route.AccountName, &route.Memo, &route.QRValue, &route.Instructions, &routeCreatedAt, &routeUpdatedAt,
		); err != nil {
			return nil, err
		}
		item.NotifyAt = timePtr(notifyAt)
		item.ExpireAt = timePtr(expireAt)
		item.PaidAt = timePtr(paidAt)
		item.CreatedAt = timePtr(createdAt)
		item.UpdatedAt = timePtr(updatedAt)
		route.OrderID = item.ID
		route.CreatedAt = timePtr(routeCreatedAt)
		route.UpdatedAt = timePtr(routeUpdatedAt)
		item.Route = &route
		list = append(list, item)
	}
	return list, rows.Err()
}
