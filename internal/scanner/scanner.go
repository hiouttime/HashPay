package scanner

import (
	"database/sql"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"hashpay/internal/model"
	"hashpay/internal/pkg/log"
	"hashpay/internal/repository"
	"hashpay/internal/service"

	"github.com/shopspring/decimal"
)

// Scanner 区块链交易扫描器
type Scanner struct {
	orders        *service.OrderService
	txRepo        *repository.TransactionRepo
	chains        map[ChainType]ChainAPI
	mu            sync.RWMutex
	running       bool
	stopCh        chan struct{}
	interval      time.Duration
	startAt       int64
	cursorByChain map[ChainType]int64

	// 订单确认回调
	onConfirm func(order model.Order, tx Transaction)
}

// New 创建扫描器
func New(orders *service.OrderService, txRepo *repository.TransactionRepo, interval time.Duration) *Scanner {
	return &Scanner{
		orders:        orders,
		txRepo:        txRepo,
		chains:        make(map[ChainType]ChainAPI),
		stopCh:        make(chan struct{}),
		interval:      interval,
		startAt:       time.Now().Unix(),
		cursorByChain: make(map[ChainType]int64),
	}
}

// RegisterChain 注册链 API
func (s *Scanner) RegisterChain(api ChainAPI) {
	s.mu.Lock()
	s.chains[api.ChainType()] = api
	s.mu.Unlock()
}

// OnConfirm 设置订单确认回调
func (s *Scanner) OnConfirm(fn func(order model.Order, tx Transaction)) {
	s.onConfirm = fn
}

// Start 启动扫描器
func (s *Scanner) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	go s.run()
	log.Info("区块链扫描器已启动")
}

// Stop 停止扫描器
func (s *Scanner) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false
	s.mu.Unlock()

	close(s.stopCh)
	log.Info("区块链扫描器已停止")
}

func (s *Scanner) run() {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.scan()
		case <-s.stopCh:
			return
		}
	}
}

func (s *Scanner) scan() {
	expiredCount, err := s.orders.ExpirePending()
	if err != nil {
		log.Error("处理过期订单失败: %v", err)
	} else if expiredCount > 0 {
		log.Info("订单过期处理完成: %d 笔", expiredCount)
	}

	orders, err := s.orders.GetPending()
	if err != nil {
		log.Error("获取待处理订单失败: %v", err)
		return
	}

	if len(orders) == 0 {
		return
	}

	log.Debug("扫描 %d 笔待处理订单", len(orders))

	// 按链分组
	grouped := s.groupByChain(orders)
	now := time.Now().Unix()

	for chain, chainOrders := range grouped {
		fromTime := s.getChainCursor(chain)
		if s.scanChain(chain, chainOrders, fromTime) {
			s.setChainCursor(chain, now)
		}
	}
}

func (s *Scanner) groupByChain(orders []model.Order) map[ChainType][]model.Order {
	grouped := make(map[ChainType][]model.Order)
	for _, order := range orders {
		if order.PayChain != "" {
			chain := normalizeChain(order.PayChain)
			grouped[chain] = append(grouped[chain], order)
		}
	}
	return grouped
}

func (s *Scanner) scanChain(chain ChainType, orders []model.Order, fromTime int64) bool {
	s.mu.RLock()
	api, exists := s.chains[chain]
	s.mu.RUnlock()

	if !exists {
		return false
	}
	success := true

	// 按地址分组
	addrMap := make(map[string][]model.Order)
	for _, order := range orders {
		if order.PayAddr != "" {
			addrMap[order.PayAddr] = append(addrMap[order.PayAddr], order)
		}
	}

	for addr, addrOrders := range addrMap {
		sort.Slice(addrOrders, func(i, j int) bool {
			return addrOrders[i].CreatedAt.Before(addrOrders[j].CreatedAt)
		})
		if !s.scanAddress(chain, api, addr, addrOrders, fromTime) {
			success = false
		}
	}
	return success
}

func (s *Scanner) scanAddress(chain ChainType, api ChainAPI, addr string, orders []model.Order, fromTime int64) bool {
	txs, err := api.GetTransactions(addr, fromTime)
	if err != nil {
		log.Error("获取地址 %s 交易失败: %v", addr, err)
		return false
	}

	sort.Slice(txs, func(i, j int) bool {
		return txs[i].Timestamp < txs[j].Timestamp
	})

	for _, tx := range txs {
		if tx.Chain == "" {
			tx.Chain = chain
		}
		s.matchTransaction(tx, orders)
	}
	return true
}

func (s *Scanner) getChainCursor(chain ChainType) int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cursor, ok := s.cursorByChain[chain]
	if ok && cursor > 0 {
		return cursor
	}
	return s.startAt
}

func (s *Scanner) setChainCursor(chain ChainType, cursor int64) {
	s.mu.Lock()
	s.cursorByChain[chain] = cursor
	s.mu.Unlock()
}

func (s *Scanner) matchTransaction(tx Transaction, orders []model.Order) {
	if tx.Hash == "" {
		return
	}
	if s.isTxProcessed(tx.Hash) {
		return
	}

	order, ok := s.pickMatchedOrder(tx, orders)
	if !ok {
		return
	}

	log.Success("订单 %s 匹配交易 %s", order.ID, tx.Hash)
	s.confirmOrder(order, tx)
}

func (s *Scanner) pickMatchedOrder(tx Transaction, orders []model.Order) (model.Order, bool) {
	for _, order := range orders {
		if order.PayAmount <= 0 {
			continue
		}
		if order.PayAddr == "" || order.PayCurrency == "" {
			continue
		}
		if tx.To != "" && !isAddressMatch(normalizeChain(order.PayChain), order.PayAddr, tx.To) {
			continue
		}
		if tx.Timestamp > 0 {
			ts := tx.Timestamp
			if ts < order.CreatedAt.Unix() || ts > order.ExpireAt.Unix() {
				continue
			}
		}
		if !strings.EqualFold(strings.TrimSpace(order.PayCurrency), strings.TrimSpace(tx.Currency)) {
			continue
		}

		expected := decimal.NewFromFloat(order.PayAmount)
		diff := tx.Amount.Sub(expected).Abs()
		if diff.GreaterThan(decimal.RequireFromString("0.000001")) {
			continue
		}

		return order, true
	}
	return model.Order{}, false
}

func (s *Scanner) isTxProcessed(txHash string) bool {
	if s.txRepo == nil || txHash == "" {
		return false
	}

	_, err := s.txRepo.GetByHash(txHash)
	if err == nil {
		return true
	}
	if errors.Is(err, sql.ErrNoRows) {
		return false
	}

	log.Error("查询交易 %s 失败: %v", txHash, err)
	return true
}

func (s *Scanner) confirmOrder(order model.Order, tx Transaction) {
	err := s.orders.MarkPaid(order.ID, tx.Hash)
	if err != nil {
		log.Error("更新订单 %s 状态失败: %v", order.ID, err)
		return
	}

	s.saveTransaction(order, tx)

	if s.onConfirm != nil {
		s.onConfirm(order, tx)
	}
}

func (s *Scanner) saveTransaction(order model.Order, tx Transaction) {
	if s.txRepo == nil {
		return
	}

	ts := tx.Timestamp
	if ts <= 0 {
		ts = time.Now().Unix()
	}

	chain := strings.TrimSpace(string(tx.Chain))
	if chain == "" {
		chain = strings.TrimSpace(order.PayChain)
	}

	currency := strings.ToUpper(strings.TrimSpace(tx.Currency))
	if currency == "" {
		currency = strings.ToUpper(strings.TrimSpace(order.PayCurrency))
	}

	amount := tx.Amount
	if amount.IsZero() {
		amount = decimal.NewFromFloat(order.PayAmount)
	}

	err := s.txRepo.Create(&model.Transaction{
		OrderID:   order.ID,
		Chain:     chain,
		TxHash:    tx.Hash,
		FromAddr:  strings.TrimSpace(tx.From),
		ToAddr:    strings.TrimSpace(tx.To),
		Amount:    amount,
		Currency:  currency,
		BlockNum:  tx.BlockNum,
		Confirmed: true,
		CreatedAt: time.Unix(ts, 0),
	})
	if err == nil {
		return
	}
	if isDuplicateTxErr(err) {
		return
	}

	log.Error("记录交易 %s 失败: %v", tx.Hash, err)
}

func isAddressMatch(chain ChainType, a, b string) bool {
	la := strings.TrimSpace(a)
	lb := strings.TrimSpace(b)
	if la == "" || lb == "" {
		return false
	}

	switch chain {
	case ChainETH, ChainBSC, ChainPolygon, ChainEVM:
		return strings.EqualFold(la, lb)
	default:
		return la == lb
	}
}

func isDuplicateTxErr(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique constraint") || strings.Contains(msg, "duplicate entry")
}
