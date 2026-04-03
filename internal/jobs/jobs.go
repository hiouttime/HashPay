package jobs

import (
	"math"
	"strings"
	"time"

	"hashpay/internal/config"
	"hashpay/internal/pkg/log"
	"hashpay/internal/scanner"
	"hashpay/internal/store"
	"hashpay/internal/usecase"
)

type BotSync interface {
	NotifyPaid(orderID string)
	NotifyExpired(orderID string)
}

type Runner struct {
	store   *store.Store
	app     *usecase.App
	cfg     *config.Config
	bot     BotSync
	stopCh  chan struct{}
	clients map[string]scanner.ChainAPI
}

func New(store *store.Store, app *usecase.App, cfg *config.Config, bot BotSync) *Runner {
	return &Runner{
		store:  store,
		app:    app,
		cfg:    cfg,
		bot:    bot,
		stopCh: make(chan struct{}),
		clients: map[string]scanner.ChainAPI{
			"chain/tron":   scanner.NewTronAPI(tronURL(cfg.Debug), ""),
			"chain/evm":    scanner.NewEVMHubAPI(scanner.NewEVMAPIWithNetwork(scanner.ChainETH, ethURL(cfg.Debug), cfg.Debug), scanner.NewEVMAPIWithNetwork(scanner.ChainBSC, bscURL(cfg.Debug), cfg.Debug), scanner.NewEVMAPIWithNetwork(scanner.ChainPolygon, polygonURL(cfg.Debug), cfg.Debug)),
			"chain/solana": scanner.NewSolanaAPI(solanaURL(cfg.Debug)),
			"chain/ton":    scanner.NewTonAPI(tonURL(cfg.Debug)),
		},
	}
}

func (r *Runner) Start() {
	go r.loopExpiry()
	go r.loopNotify()
	go r.loopScan()
}

func (r *Runner) Stop() {
	close(r.stopCh)
}

func (r *Runner) loopExpiry() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			count, err := r.store.ExpireOrders(time.Now())
			if err != nil {
				log.Error("ExpireJob 失败: %v", err)
				continue
			}
			if count > 0 && r.bot != nil {
				orders, _ := r.store.ListOrders(50, store.OrderExpired)
				for _, item := range orders {
					if time.Since(item.UpdatedAt) < 10*time.Second {
						r.bot.NotifyExpired(item.ID)
					}
				}
			}
		case <-r.stopCh:
			return
		}
	}
}

func (r *Runner) loopNotify() {
	ticker := time.NewTicker(8 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			list, err := r.store.DueNotifications(20)
			if err != nil {
				log.Error("NotifyJob 读取失败: %v", err)
				continue
			}
			for _, item := range list {
				if err := r.app.PostCallback(item); err != nil {
					_ = r.store.UpdateOrderNotify(item.OrderID, store.NotifyRetry, err.Error())
					_ = r.store.MarkNotificationRetry(item.ID, item.Attempts+1, err.Error(), time.Now().Add(time.Duration(item.Attempts+1)*time.Minute))
					continue
				}
				_ = r.store.UpdateOrderNotify(item.OrderID, store.NotifyDone, "")
				_ = r.store.MarkNotificationDone(item.ID)
			}
		case <-r.stopCh:
			return
		}
	}
}

func (r *Runner) loopScan() {
	ticker := time.NewTicker(6 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			r.scanOnce()
		case <-r.stopCh:
			return
		}
	}
}

func (r *Runner) scanOnce() {
	items, err := r.store.ListPendingRoutes()
	if err != nil {
		log.Error("ScanJob 读取订单失败: %v", err)
		return
	}
	for _, order := range items {
		if order.Route == nil {
			continue
		}
		client := r.clients[order.Route.Driver]
		if client == nil {
			continue
		}
		cursorKey := "scan:" + order.Route.Driver + ":" + strings.ToLower(order.Route.Address)
		from := r.store.Cursor(cursorKey)
		if from == 0 {
			from = order.CreatedAt.Unix()
		}
		txs, err := client.GetTransactions(order.Route.Address, from)
		if err != nil {
			log.Error("ScanJob 获取交易失败: driver=%s err=%v", order.Route.Driver, err)
			continue
		}
		latest := from
		for _, tx := range txs {
			if tx.Timestamp > latest {
				latest = tx.Timestamp
			}
			r.match(order, tx)
		}
		if latest > from {
			_ = r.store.SetCursor(cursorKey, latest)
		}
	}
}

func (r *Runner) match(order store.Order, tx scanner.Transaction) {
	if order.Route == nil || strings.TrimSpace(tx.Hash) == "" {
		return
	}
	ok, err := r.store.HasTx(tx.Hash)
	if err == nil && ok {
		return
	}
	if tx.Timestamp > 0 && (tx.Timestamp < order.CreatedAt.Unix() || tx.Timestamp > order.ExpireAt.Unix()) {
		return
	}
	if tx.To != "" && !strings.EqualFold(strings.TrimSpace(tx.To), strings.TrimSpace(order.Route.Address)) && tx.To != order.Route.Address {
		return
	}
	if !strings.EqualFold(strings.TrimSpace(tx.Currency), strings.TrimSpace(order.Route.Currency)) {
		return
	}
	if math.Abs(tx.Amount.InexactFloat64()-order.Route.Amount) > tolerance(order) {
		return
	}

	if err := r.store.MarkOrderPaid(order.ID, tx.Hash); err != nil {
		return
	}
	_ = r.store.SaveTx(&store.PaymentTx{
		OrderID:   order.ID,
		RouteID:   order.Route.ID,
		MethodID:  order.Route.MethodID,
		Driver:    order.Route.Driver,
		Network:   order.Route.Network,
		Currency:  order.Route.Currency,
		TxHash:    tx.Hash,
		FromAddr:  tx.From,
		ToAddr:    tx.To,
		Amount:    tx.Amount.InexactFloat64(),
		CreatedAt: time.Unix(max(tx.Timestamp, time.Now().Unix()), 0),
	})
	_ = r.store.QueueNotification(order.ID)
	if r.bot != nil {
		r.bot.NotifyPaid(order.ID)
	}
}

func tolerance(order store.Order) float64 {
	if order.Route == nil {
		return 0.000001
	}
	if order.Route.Kind == "exchange" {
		return 0.01
	}
	return 0.000001
}

func max(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func tronURL(debug bool) string {
	if debug {
		return "https://nile.trongrid.io"
	}
	return "https://api.trongrid.io"
}

func ethURL(debug bool) string {
	if debug {
		return "https://rpc.sepolia.org"
	}
	return "https://cloudflare-eth.com"
}

func bscURL(debug bool) string {
	if debug {
		return "https://data-seed-prebsc-1-s1.binance.org:8545"
	}
	return "https://bsc-dataseed.binance.org"
}

func polygonURL(debug bool) string {
	if debug {
		return "https://rpc-amoy.polygon.technology"
	}
	return "https://polygon-rpc.com"
}

func solanaURL(debug bool) string {
	if debug {
		return "https://api.devnet.solana.com"
	}
	return "https://api.mainnet-beta.solana.com"
}

func tonURL(debug bool) string {
	if debug {
		return "https://testnet.toncenter.com/api/v2"
	}
	return "https://toncenter.com/api/v2"
}
