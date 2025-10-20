package payment

import (
	"database/sql"
	"sync"
	"time"

	"hashpay/internal/database"
	"hashpay/internal/ui"

	"github.com/shopspring/decimal"
)

type APIScheduler struct {
	db       *database.DB
	chains   map[ChainType]ChainAPI
	interval time.Duration
	mu       sync.RWMutex
	running  bool
	stopCh   chan struct{}
}

func NewScheduler(db *database.DB, interval time.Duration) *APIScheduler {
	return &APIScheduler{
		db:       db,
		chains:   make(map[ChainType]ChainAPI),
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

func (s *APIScheduler) RegisterChain(chain ChainType, api ChainAPI) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.chains[chain] = api
}

func (s *APIScheduler) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	go s.run()
	ui.Info("API 调度器启动")
}

func (s *APIScheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false
	s.mu.Unlock()

	close(s.stopCh)
	ui.Info("API 调度器停止")
}

func (s *APIScheduler) run() {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.checkAll()
		case <-s.stopCh:
			return
		}
	}
}

func (s *APIScheduler) checkAll() {
	orders, err := s.db.GetPendingOrders()
	if err != nil {
		ui.Error("获取待处理订单失败: %v", err)
		return
	}

	if len(orders) == 0 {
		return
	}

	ui.Debug("检查 %d 笔待处理订单", len(orders))

	grouped := s.groupByChain(orders)

	for chain, orderList := range grouped {
		s.checkChain(chain, orderList)
	}
}

func (s *APIScheduler) groupByChain(orders []database.Order) map[ChainType][]database.Order {
	grouped := make(map[ChainType][]database.Order)

	for _, order := range orders {
		if order.PayChain.Valid {
			chain := ChainType(order.PayChain.String)
			grouped[chain] = append(grouped[chain], order)
		}
	}

	return grouped
}

func (s *APIScheduler) checkChain(chain ChainType, orders []database.Order) {
	api, exists := s.chains[chain]
	if !exists {
		ui.Warn("未找到链路 %s 的 API", chain)
		return
	}

	addrMap := make(map[string][]database.Order)
	for _, order := range orders {
		if order.PayAddr.Valid {
			addr := order.PayAddr.String
			addrMap[addr] = append(addrMap[addr], order)
		}
	}

	for addr, addrOrders := range addrMap {
		s.checkAddress(api, addr, addrOrders)
	}
}

func (s *APIScheduler) checkAddress(api ChainAPI, addr string, orders []database.Order) {
	fromTime := time.Now().Add(-24 * time.Hour).Unix()

	txs, err := api.GetTxs(addr, fromTime)
	if err != nil {
		ui.Error("获取地址 %s 的交易失败: %v", addr, err)
		return
	}

	ui.Debug("地址 %s 匹配到 %d 笔交易", addr, len(txs))

	for _, tx := range txs {
		s.matchTx(tx, orders)
	}
}

func (s *APIScheduler) matchTx(tx Transaction, orders []database.Order) {
	for _, order := range orders {
		if !order.PayAmount.Valid {
			continue
		}

		expectedAmount := decimal.NewFromFloat(order.PayAmount.Float64)
		tolerance := expectedAmount.Mul(decimal.NewFromFloat(0.01))

		diff := tx.Amount.Sub(expectedAmount).Abs()

		if diff.LessThanOrEqual(tolerance) {
			ui.Success("订单 %s 匹配交易 %s", order.ID, tx.Hash)
			s.confirmOrder(order, tx)
			break
		}
	}
}

func (s *APIScheduler) confirmOrder(order database.Order, tx Transaction) {
	err := s.db.UpdateOrderStatus(order.ID, 1, tx.Hash)

	if err != nil {
		ui.Error("更新订单 %s 状态失败: %v", order.ID, err)
		return
	}

	now := time.Now().Unix()
	transaction := &database.Transaction{
		OrderID:   order.ID,
		Chain:     order.PayChain.String,
		TxHash:    tx.Hash,
		FromAddr:  tx.From,
		ToAddr:    tx.To,
		Amount:    tx.Amount.InexactFloat64(),
		Currency:  tx.Currency,
		BlockNum:  sql.NullInt64{Int64: tx.BlockNum, Valid: true},
		Confirmed: sql.NullInt64{Int64: 1, Valid: true},
		CreatedAt: now,
	}

	err = s.db.CreateTransaction(transaction)

	if err != nil {
		ui.Error("保存交易记录失败: %v", err)
	}
}
