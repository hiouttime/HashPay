package repository

import (
	"database/sql"
	"time"

	"hashpay/internal/model"

	"github.com/shopspring/decimal"
)

type TransactionRepo struct {
	db *DB
}

func NewTransactionRepo(db *DB) *TransactionRepo {
	return &TransactionRepo{db: db}
}

func (r *TransactionRepo) Create(t *model.Transaction) error {
	query := `
		INSERT INTO transactions (
			order_id, chain, tx_hash, from_addr, to_addr,
			amount, currency, block_num, confirmed, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	confirmed := 0
	if t.Confirmed {
		confirmed = 1
	}

	result, err := r.db.Exec(query,
		t.OrderID, t.Chain, t.TxHash, t.FromAddr, t.ToAddr,
		t.Amount.String(), t.Currency, t.BlockNum, confirmed, t.CreatedAt.Unix(),
	)
	if err != nil {
		return err
	}

	id, _ := result.LastInsertId()
	t.ID = id
	return nil
}

func (r *TransactionRepo) GetByHash(hash string) (*model.Transaction, error) {
	query := `
		SELECT id, order_id, chain, tx_hash, from_addr, to_addr,
		       amount, currency, block_num, confirmed, raw_data, created_at
		FROM transactions WHERE tx_hash = ?
	`
	return r.scanTransaction(r.db.QueryRow(query, hash))
}

func (r *TransactionRepo) GetByOrderID(orderID string) ([]model.Transaction, error) {
	query := `
		SELECT id, order_id, chain, tx_hash, from_addr, to_addr,
		       amount, currency, block_num, confirmed, raw_data, created_at
		FROM transactions WHERE order_id = ?
	`
	return r.queryTransactions(query, orderID)
}

func (r *TransactionRepo) queryTransactions(query string, args ...any) ([]model.Transaction, error) {
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []model.Transaction
	for rows.Next() {
		t, err := r.scanTransactionRow(rows)
		if err != nil {
			return nil, err
		}
		txs = append(txs, *t)
	}
	return txs, nil
}

type txScanner interface {
	Scan(dest ...any) error
}

func (r *TransactionRepo) scanTransaction(row *sql.Row) (*model.Transaction, error) {
	return r.scanTxScanner(row)
}

func (r *TransactionRepo) scanTransactionRow(row *sql.Rows) (*model.Transaction, error) {
	return r.scanTxScanner(row)
}

func (r *TransactionRepo) scanTxScanner(s txScanner) (*model.Transaction, error) {
	var t model.Transaction
	var amountStr string
	var blockNum sql.NullInt64
	var confirmed int
	var rawData sql.NullString
	var createdAt int64

	err := s.Scan(
		&t.ID, &t.OrderID, &t.Chain, &t.TxHash, &t.FromAddr, &t.ToAddr,
		&amountStr, &t.Currency, &blockNum, &confirmed, &rawData, &createdAt,
	)
	if err != nil {
		return nil, err
	}

	t.Amount, _ = decimal.NewFromString(amountStr)
	t.BlockNum = blockNum.Int64
	t.Confirmed = confirmed == 1
	t.RawData = rawData.String
	t.CreatedAt = time.Unix(createdAt, 0)

	return &t, nil
}
