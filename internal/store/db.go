package store

import (
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"hashpay/internal/config"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed migrations.sql
var migrations string

type DB struct {
	*sql.DB
	driver string
}

func Open(cfg *config.Config) (*DB, error) {
	driver, dsn := cfg.DSN()
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &DB{DB: db, driver: driver}, nil
}

func (db *DB) Migrate() error {
	_, err := db.Exec(migrations)
	return err
}

type Store struct {
	db *DB
}

func New(db *DB) *Store {
	return &Store{db: db}
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) DB() *DB {
	return s.db
}

func nowUnix() int64 {
	return time.Now().Unix()
}

func timePtr(v int64) time.Time {
	if v <= 0 {
		return time.Time{}
	}
	return time.Unix(v, 0)
}

func newID(prefix string, n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return prefix + strings.ToUpper(hex.EncodeToString(buf)), nil
}

func newOrderID() string {
	id, err := newID("", 8)
	if err != nil {
		return fmt.Sprintf("HP%d", time.Now().UnixNano())
	}
	return id
}

func newRouteID() string {
	id, err := newID("RT", 6)
	if err != nil {
		return fmt.Sprintf("RT%d", time.Now().UnixNano())
	}
	return id
}

func (s *Store) GetConfig(key, fallback string) string {
	var value string
	err := s.db.QueryRow("SELECT value FROM configs WHERE key = ?", strings.TrimSpace(key)).Scan(&value)
	if err != nil {
		return fallback
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func (s *Store) Configs() (map[string]string, error) {
	rows, err := s.db.Query("SELECT key, value FROM configs ORDER BY key")
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

func (s *Store) SetConfigs(values map[string]string) error {
	tx, err := s.db.Begin()
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

func (s *Store) UpsertAdmin(id int64, username string) error {
	ts := nowUnix()
	_, err := s.db.Exec(`
		INSERT INTO admin_users(id, username, created_at, updated_at)
		VALUES(?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET username = excluded.username, updated_at = excluded.updated_at
	`, id, strings.TrimSpace(username), ts, ts)
	return err
}

func (s *Store) IsAdmin(id int64) (bool, error) {
	var exists int
	err := s.db.QueryRow("SELECT 1 FROM admin_users WHERE id = ? LIMIT 1", id).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (s *Store) ListMerchants() ([]Merchant, error) {
	rows, err := s.db.Query(`
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

func (s *Store) GetMerchantByID(id string) (*Merchant, error) {
	var item Merchant
	var createdAt int64
	var updatedAt int64
	err := s.db.QueryRow(`
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

func (s *Store) GetMerchantByAPIKey(apiKey string) (*Merchant, error) {
	var item Merchant
	var createdAt int64
	var updatedAt int64
	err := s.db.QueryRow(`
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

func (s *Store) SaveMerchant(item *Merchant) error {
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
	err := s.db.QueryRow("SELECT 1 FROM merchants WHERE id = ? LIMIT 1", item.ID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = s.db.Exec(`
			INSERT INTO merchants(id, name, api_key, secret_key, callback_url, status, created_at, updated_at)
			VALUES(?, ?, ?, ?, ?, ?, ?, ?)
		`, item.ID, strings.TrimSpace(item.Name), item.APIKey, item.SecretKey, strings.TrimSpace(item.CallbackURL), item.Status, now, now)
		return err
	}
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
		UPDATE merchants
		SET name = ?, api_key = ?, secret_key = ?, callback_url = ?, status = ?, updated_at = ?
		WHERE id = ?
	`, strings.TrimSpace(item.Name), item.APIKey, item.SecretKey, strings.TrimSpace(item.CallbackURL), item.Status, now, item.ID)
	return err
}

func (s *Store) DeleteMerchant(id string) error {
	_, err := s.db.Exec("DELETE FROM merchants WHERE id = ?", strings.TrimSpace(id))
	return err
}

func (s *Store) ListPaymentMethods() ([]PaymentMethod, error) {
	rows, err := s.db.Query(`
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
		item.Fields, err = s.paymentFields(item.ID)
		if err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

func (s *Store) GetPaymentMethod(id int64) (*PaymentMethod, error) {
	var item PaymentMethod
	var enabled int
	var createdAt int64
	var updatedAt int64
	err := s.db.QueryRow(`
		SELECT id, driver, kind, name, enabled, created_at, updated_at
		FROM payment_methods WHERE id = ?
	`, id).Scan(&item.ID, &item.Driver, &item.Kind, &item.Name, &enabled, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	item.Enabled = enabled == 1
	item.CreatedAt = timePtr(createdAt)
	item.UpdatedAt = timePtr(updatedAt)
	item.Fields, err = s.paymentFields(item.ID)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Store) SavePaymentMethod(item *PaymentMethod) error {
	if item == nil {
		return fmt.Errorf("payment method is nil")
	}
	now := nowUnix()
	tx, err := s.db.Begin()
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

func (s *Store) DeletePaymentMethod(id int64) error {
	_, err := s.db.Exec("DELETE FROM payment_methods WHERE id = ?", id)
	return err
}

func (s *Store) paymentFields(methodID int64) (map[string]string, error) {
	rows, err := s.db.Query("SELECT field_key, field_value FROM payment_method_fields WHERE method_id = ?", methodID)
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

func (s *Store) CreateOrder(item *Order) error {
	if item == nil {
		return fmt.Errorf("order is nil")
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
	_, err := s.db.Exec(`
		INSERT INTO orders(
			id, merchant_id, merchant_order_no, source, customer_ref, fiat_amount, fiat_currency, status,
			callback_url, redirect_url, tx_hash, notify_status, notify_error, notify_at, expire_at, paid_at, created_at, updated_at
		)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, item.ID, item.MerchantID, item.MerchantOrderNo, item.Source, item.CustomerRef, item.FiatAmount, strings.ToUpper(item.FiatCurrency), item.Status,
		strings.TrimSpace(item.CallbackURL), strings.TrimSpace(item.RedirectURL), strings.TrimSpace(item.TxHash),
		strings.TrimSpace(item.NotifyStatus), strings.TrimSpace(item.NotifyError), item.NotifyAt.Unix(), item.ExpireAt.Unix(),
		item.PaidAt.Unix(), item.CreatedAt.Unix(), item.UpdatedAt.Unix())
	return err
}

func (s *Store) GetOrderByMerchantRef(merchantID, ref string) (*Order, error) {
	return s.orderByQuery(`
		SELECT id, merchant_id, merchant_order_no, source, customer_ref, fiat_amount, fiat_currency, status,
			callback_url, redirect_url, tx_hash, notify_status, notify_error, notify_at, expire_at, paid_at, created_at, updated_at
		FROM orders WHERE merchant_id = ? AND merchant_order_no = ?
	`, strings.TrimSpace(merchantID), strings.TrimSpace(ref))
}

func (s *Store) GetOrder(id string) (*Order, error) {
	item, err := s.orderByQuery(`
		SELECT id, merchant_id, merchant_order_no, source, customer_ref, fiat_amount, fiat_currency, status,
			callback_url, redirect_url, tx_hash, notify_status, notify_error, notify_at, expire_at, paid_at, created_at, updated_at
		FROM orders WHERE id = ?
	`, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	route, err := s.GetRouteByOrder(item.ID)
	if err == nil {
		item.Route = route
	}
	return item, nil
}

func (s *Store) orderByQuery(query string, args ...any) (*Order, error) {
	var item Order
	var notifyAt, expireAt, paidAt, createdAt, updatedAt int64
	err := s.db.QueryRow(query, args...).Scan(
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

func (s *Store) ListOrders(limit int, status string) ([]Order, error) {
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
	rows, err := s.db.Query(query, args...)
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

func (s *Store) SaveRoute(route *PaymentRoute) error {
	if route == nil {
		return fmt.Errorf("route is nil")
	}
	now := time.Now()
	if strings.TrimSpace(route.ID) == "" {
		route.ID = newRouteID()
	}
	if route.CreatedAt.IsZero() {
		route.CreatedAt = now
	}
	route.UpdatedAt = now

	tx, err := s.db.Begin()
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
	if _, err := tx.Exec(`
		UPDATE orders SET updated_at = ? WHERE id = ?
	`, now.Unix(), route.OrderID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) GetRouteByOrder(orderID string) (*PaymentRoute, error) {
	var item PaymentRoute
	var createdAt, updatedAt int64
	err := s.db.QueryRow(`
		SELECT id, order_id, method_id, driver, kind, network, currency, amount, address, account_name, memo, qr_value, instructions, created_at, updated_at
		FROM payment_routes WHERE order_id = ?
	`, strings.TrimSpace(orderID)).Scan(&item.ID, &item.OrderID, &item.MethodID, &item.Driver, &item.Kind, &item.Network, &item.Currency, &item.Amount,
		&item.Address, &item.AccountName, &item.Memo, &item.QRValue, &item.Instructions, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	item.CreatedAt = timePtr(createdAt)
	item.UpdatedAt = timePtr(updatedAt)
	return &item, nil
}

func (s *Store) ListPendingRoutes() ([]Order, error) {
	rows, err := s.db.Query(`
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

func (s *Store) MarkOrderPaid(orderID, txHash string) error {
	now := nowUnix()
	_, err := s.db.Exec(`
		UPDATE orders
		SET status = ?, tx_hash = ?, paid_at = ?, updated_at = ?
		WHERE id = ? AND status = ?
	`, OrderPaid, strings.TrimSpace(txHash), now, now, strings.TrimSpace(orderID), OrderPending)
	return err
}

func (s *Store) MarkOrderExpired(orderID string) error {
	_, err := s.db.Exec(`
		UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?
	`, OrderExpired, nowUnix(), strings.TrimSpace(orderID), OrderPending)
	return err
}

func (s *Store) ExpireOrders(now time.Time) (int64, error) {
	res, err := s.db.Exec(`
		UPDATE orders SET status = ?, updated_at = ? WHERE status = ? AND expire_at <= ?
	`, OrderExpired, now.Unix(), OrderPending, now.Unix())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) SaveTx(item *PaymentTx) error {
	if item == nil {
		return fmt.Errorf("tx is nil")
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = time.Now()
	}
	_, err := s.db.Exec(`
		INSERT INTO payment_txs(order_id, route_id, method_id, driver, network, currency, tx_hash, from_addr, to_addr, amount, created_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, item.OrderID, item.RouteID, item.MethodID, item.Driver, item.Network, item.Currency, item.TxHash, item.FromAddr, item.ToAddr, item.Amount, item.CreatedAt.Unix())
	return err
}

func (s *Store) HasTx(txHash string) (bool, error) {
	var id int64
	err := s.db.QueryRow("SELECT id FROM payment_txs WHERE tx_hash = ? LIMIT 1", strings.TrimSpace(txHash)).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (s *Store) QueueNotification(orderID string) error {
	ts := nowUnix()
	_, err := s.db.Exec(`
		INSERT INTO notification_tasks(order_id, status, attempts, last_error, next_run_at, created_at, updated_at)
		VALUES(?, ?, 0, '', ?, ?, ?)
	`, orderID, NotifyPending, ts, ts, ts)
	return err
}

func (s *Store) DueNotifications(limit int) ([]NotificationTask, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.Query(`
		SELECT id, order_id, status, attempts, last_error, next_run_at, created_at, updated_at
		FROM notification_tasks
		WHERE status IN (?, ?) AND next_run_at <= ?
		ORDER BY next_run_at ASC
		LIMIT ?
	`, NotifyPending, NotifyRetry, nowUnix(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []NotificationTask
	for rows.Next() {
		var item NotificationTask
		var nextRunAt, createdAt, updatedAt int64
		if err := rows.Scan(&item.ID, &item.OrderID, &item.Status, &item.Attempts, &item.LastError, &nextRunAt, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item.NextRunAt = timePtr(nextRunAt)
		item.CreatedAt = timePtr(createdAt)
		item.UpdatedAt = timePtr(updatedAt)
		list = append(list, item)
	}
	return list, rows.Err()
}

func (s *Store) MarkNotificationDone(id int64) error {
	_, err := s.db.Exec(`
		UPDATE notification_tasks SET status = ?, updated_at = ? WHERE id = ?
	`, NotifyDone, nowUnix(), id)
	return err
}

func (s *Store) MarkNotificationRetry(id int64, attempts int, errText string, next time.Time) error {
	status := NotifyRetry
	if attempts >= 5 {
		status = NotifyFailed
	}
	_, err := s.db.Exec(`
		UPDATE notification_tasks
		SET status = ?, attempts = ?, last_error = ?, next_run_at = ?, updated_at = ?
		WHERE id = ?
	`, status, attempts, strings.TrimSpace(errText), next.Unix(), nowUnix(), id)
	return err
}

func (s *Store) UpdateOrderNotify(orderID, status, errText string) error {
	ts := nowUnix()
	_, err := s.db.Exec(`
		UPDATE orders SET notify_status = ?, notify_error = ?, notify_at = ?, updated_at = ? WHERE id = ?
	`, strings.TrimSpace(status), strings.TrimSpace(errText), ts, ts, strings.TrimSpace(orderID))
	return err
}

func (s *Store) Cursor(key string) int64 {
	var value int64
	if err := s.db.QueryRow("SELECT cursor_value FROM job_cursors WHERE cursor_key = ?", strings.TrimSpace(key)).Scan(&value); err != nil {
		return 0
	}
	return value
}

func (s *Store) SetCursor(key string, value int64) error {
	_, err := s.db.Exec(`
		INSERT INTO job_cursors(cursor_key, cursor_value, updated_at)
		VALUES(?, ?, ?)
		ON CONFLICT(cursor_key) DO UPDATE SET cursor_value = excluded.cursor_value, updated_at = excluded.updated_at
	`, strings.TrimSpace(key), value, nowUnix())
	return err
}

func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
