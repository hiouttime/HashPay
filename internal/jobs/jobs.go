package jobs

import (
	"sync"
	"time"

	"hashpay/internal/models"
	"hashpay/internal/payments"
	"hashpay/internal/service"
	"hashpay/internal/utils/log"
)

type OrderNotifier interface {
	NotifyPaid(orderID string)
	NotifyExpired(orderID string)
}

type Runner struct {
	models   *models.Models
	app      *service.App
	debug    bool
	bot      OrderNotifier
	stopCh   chan struct{}
	stopOnce sync.Once
}

func New(db *models.Models, app *service.App, debug bool, bot OrderNotifier) *Runner {
	return &Runner{
		models: db,
		app:    app,
		debug:  debug,
		bot:    bot,
		stopCh: make(chan struct{}),
	}
}

func (r *Runner) Start() {
	go r.loopExpiry()
	go r.loopNotify()
	go r.loopScan()
}

func (r *Runner) Stop() {
	r.stopOnce.Do(func() {
		close(r.stopCh)
	})
}

func (r *Runner) loopExpiry() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			count, err := r.models.ExpireOrders(time.Now())
			if err != nil {
				log.Error("ExpiryJob 失败: %v", err)
				continue
			}
			if count == 0 || r.bot == nil {
				continue
			}
			orders, _ := r.models.ListOrders(50, models.OrderExpired)
			for _, item := range orders {
				if time.Since(item.UpdatedAt) < 10*time.Second {
					r.bot.NotifyExpired(item.ID)
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
			list, err := r.models.DueNotifications(20)
			if err != nil {
				log.Error("NotifyJob 读取失败: %v", err)
				continue
			}
			for _, item := range list {
				if err := r.app.PostCallback(item); err != nil {
					_ = r.models.UpdateOrderNotify(item.OrderID, models.NotifyRetry, err.Error())
					_ = r.models.MarkNotificationRetry(item.ID, item.Attempts+1, err.Error(), time.Now().Add(time.Duration(item.Attempts+1)*time.Minute))
					continue
				}
				_ = r.models.UpdateOrderNotify(item.OrderID, models.NotifyDone, "")
				_ = r.models.MarkNotificationDone(item.ID)
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
	items, err := r.models.ListPendingRoutes()
	if err != nil {
		log.Error("ScanJob 读取订单失败: %v", err)
		return
	}
	for _, order := range items {
		if order.Route == nil {
			continue
		}
		method, err := r.models.GetPaymentMethod(order.Route.MethodID)
		if err != nil {
			continue
		}
		driver, ok := r.app.Registry.Driver(order.Route.Driver)
		if !ok {
			continue
		}
		methodView := payments.Method{
			ID:      method.ID,
			Name:    method.Name,
			Driver:  method.Driver,
			Kind:    method.Kind,
			Fields:  method.Fields,
			Enabled: method.Enabled,
		}
		scan := driver.Scanner(methodView, r.debug)
		if scan == nil {
			continue
		}

		cursorKey := scanCursorKey(order.Route)
		from := r.models.Cursor(cursorKey)
		if from == 0 {
			from = order.CreatedAt.Unix()
		}
		route := payments.Route{
			MethodID:     order.Route.MethodID,
			Driver:       order.Route.Driver,
			Kind:         order.Route.Kind,
			Network:      order.Route.Network,
			Currency:     order.Route.Currency,
			Amount:       order.Route.Amount,
			Address:      order.Route.Address,
			AccountName:  order.Route.AccountName,
			Memo:         order.Route.Memo,
			QRValue:      order.Route.QRValue,
			Instructions: order.Route.Instructions,
		}
		txs, err := scan.Scan(route, from)
		if err != nil {
			log.Error("ScanJob 获取交易失败: method=%d driver=%s err=%v", method.ID, method.Driver, err)
			continue
		}
		latest := from
		for _, tx := range txs {
			if tx.Timestamp > latest {
				latest = tx.Timestamp
			}
			if scan.Match(methodView, route, tx) {
				r.markPaid(order, tx)
			}
		}
		if latest > from {
			_ = r.models.SetCursor(cursorKey, latest)
		}
	}
}

func (r *Runner) markPaid(order models.Order, tx payments.Transaction) {
	if order.Route == nil || tx.Hash == "" {
		return
	}
	ok, err := r.models.HasTx(tx.Hash)
	if err == nil && ok {
		return
	}
	if tx.Timestamp > 0 && (tx.Timestamp < order.CreatedAt.Unix() || tx.Timestamp > order.ExpireAt.Unix()) {
		return
	}
	if err := r.models.MarkOrderPaid(order.ID, tx.Hash); err != nil {
		return
	}
	_ = r.models.SaveTx(&models.PaymentTx{
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
	_ = r.models.QueueNotification(order.ID)
	if r.bot != nil {
		r.bot.NotifyPaid(order.ID)
	}
}

func scanCursorKey(route *models.PaymentRoute) string {
	if route == nil {
		return ""
	}
	return "scan:" + route.Driver + ":" + route.ID
}

func max(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
