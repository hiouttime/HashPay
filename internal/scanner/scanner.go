package scanner

import (
	"sync"
	"time"

	"hashpay/internal/model"
	"hashpay/internal/pkg/log"
	"hashpay/internal/service"

	"github.com/shopspring/decimal"
)

// Scanner 区块链交易扫描器
type Scanner struct {
	orders  *service.OrderService
	chains  map[ChainType]ChainAPI
	mu      sync.RWMutex
	running bool
	stopCh  chan struct{}
	interval time.Duration

	// 订单确认回调
	onConfirm func(orderID, txHash string)
}

// New 创建扫描器
func New(orders *service.OrderService, interval time.Duration) *Scanner {
	return &Scanner{
		orders:   orders,
		chains:   make(map[ChainType]ChainAPI),
		stopCh:   make(chan struct{}),
		interval: interval,
	}
}

// RegisterChain 注册链 API
func (s *Scanner) RegisterChain(api ChainAPI) {
	s.mu.Lock()
	s.chains[api.ChainType()] = api
	s.mu.Unlock()
}

// OnConfirm 设置订单确认回调
func (s *Scanner) OnConfirm(fn func(orderID, txHash string)) {
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

	for chain, chainOrders := range grouped {
		s.scanChain(chain, chainOrders)
	}
}

func (s *Scanner) groupByChain(orders []model.Order) map[ChainType][]model.Order {
	grouped := make(map[ChainType][]model.Order)
	for _, order := range orders {
		if order.PayChain != "" {
			chain := ChainType(order.PayChain)
			grouped[chain] = append(grouped[chain], order)
		}
	}
	return grouped
}

func (s *Scanner) scanChain(chain ChainType, orders []model.Order) {
	s.mu.RLock()
	api, exists := s.chains[chain]
	s.mu.RUnlock()

	if !exists {
		return
	}

	// 按地址分组
	addrMap := make(map[string][]model.Order)
	for _, order := range orders {
		if order.PayAddr != "" {
			addrMap[order.PayAddr] = append(addrMap[order.PayAddr], order)
		}
	}

	for addr, addrOrders := range addrMap {
		s.scanAddress(api, addr, addrOrders)
	}
}

func (s *Scanner) scanAddress(api ChainAPI, addr string, orders []model.Order) {
	fromTime := time.Now().Add(-24 * time.Hour).Unix()

	txs, err := api.GetTransactions(addr, fromTime)
	if err != nil {
		log.Error("获取地址 %s 交易失败: %v", addr, err)
		return
	}

	for _, tx := range txs {
		s.matchTransaction(tx, orders)
	}
}

func (s *Scanner) matchTransaction(tx Transaction, orders []model.Order) {
	for _, order := range orders {
		if order.PayAmount <= 0 {
			continue
		}

		expectedAmount := decimal.NewFromFloat(order.PayAmount)
		tolerance := expectedAmount.Mul(decimal.NewFromFloat(0.01)) // 1% 容差

		diff := tx.Amount.Sub(expectedAmount).Abs()

		if diff.LessThanOrEqual(tolerance) {
			log.Success("订单 %s 匹配交易 %s", order.ID, tx.Hash)
			s.confirmOrder(order, tx)
			break
		}
	}
}

func (s *Scanner) confirmOrder(order model.Order, tx Transaction) {
	err := s.orders.MarkPaid(order.ID, tx.Hash)
	if err != nil {
		log.Error("更新订单 %s 状态失败: %v", order.ID, err)
		return
	}

	if s.onConfirm != nil {
		s.onConfirm(order.ID, tx.Hash)
	}
}
