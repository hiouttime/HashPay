package service

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"hashpay/internal/models"
	"hashpay/internal/payments"

	"github.com/shopspring/decimal"
)

type App struct {
	Models   *models.Models
	Registry *payments.Registry
}

func New(db *models.Models) *App {
	return &App{Models: db, Registry: payments.DefaultRegistry()}
}

func (a *App) BaseCurrency() string {
	return strings.ToUpper(a.Models.GetConfig("currency", "CNY"))
}

func (a *App) Rate(from, to string) float64 {
	from = strings.ToUpper(strings.TrimSpace(from))
	to = strings.ToUpper(strings.TrimSpace(to))
	if from == "" || to == "" || from == to {
		return 1
	}
	baseUSDT := map[string]float64{
		"CNY": 7.20,
		"USD": 1,
		"EUR": 1.08,
		"GBP": 1.27,
	}
	usdPrices := map[string]float64{
		"USDT": 1,
		"USDC": 1,
		"TRX":  0.12,
		"TON":  5.1,
		"BNB":  610,
		"ETH":  3200,
		"SOL":  180,
		"BTC":  85000,
	}
	adj := a.adjustment()
	base, ok := baseUSDT[from]
	if !ok {
		base = 1
	}
	if to == "USDT" || to == "USDC" {
		return base + adj
	}
	price, ok := usdPrices[to]
	if !ok {
		return 1
	}
	return (base + adj) * price
}

func (a *App) Convert(amount float64, from, to string) float64 {
	rate := a.Rate(from, to)
	if rate == 0 {
		return amount
	}
	return decimal.NewFromFloat(amount).Div(decimal.NewFromFloat(rate)).RoundCeil(6).InexactFloat64()
}

func (a *App) adjustment() float64 {
	value := a.Models.GetConfig("rate_adjust", "0")
	parsed, _ := decimal.NewFromString(value)
	return parsed.InexactFloat64()
}

type Dashboard struct {
	TodayAmount       float64        `json:"today_amount"`
	TodayCount        int            `json:"today_count"`
	PendingCount      int            `json:"pending_count"`
	FailedNotifyCount int            `json:"failed_notify_count"`
	Health            []HealthState  `json:"health"`
	RecentOrders      []models.Order `json:"recent_orders"`
}

type HealthState struct {
	Title   string `json:"title"`
	Status  string `json:"status"`
	Details string `json:"details"`
}

func (a *App) Dashboard() (*Dashboard, error) {
	orders, err := a.Models.ListOrders(8, "all")
	if err != nil {
		return nil, err
	}
	out := &Dashboard{RecentOrders: orders}
	now := time.Now()
	for _, item := range orders {
		if item.CreatedAt.YearDay() == now.YearDay() && item.CreatedAt.Year() == now.Year() && item.Status == models.OrderPaid {
			out.TodayAmount += item.FiatAmount
			out.TodayCount++
		}
		if item.Status == models.OrderPending {
			out.PendingCount++
		}
		if strings.EqualFold(item.NotifyStatus, models.NotifyFailed) {
			out.FailedNotifyCount++
		}
	}
	methods, err := a.Models.ListPaymentMethods()
	if err != nil {
		return nil, err
	}
	for _, item := range methods {
		state := HealthState{
			Title:   first(item.Name, item.Driver),
			Status:  "ok",
			Details: "已启用",
		}
		if !item.Enabled {
			state.Status = "off"
			state.Details = "未启用"
		}
		if item.Enabled && strings.TrimSpace(item.Fields["address"]) == "" && item.Kind == "chain" {
			state.Status = "warn"
			state.Details = "缺少收款地址"
		}
		if item.Enabled && item.Kind == "exchange" && strings.TrimSpace(item.Fields["account_name"]) == "" {
			state.Status = "warn"
			state.Details = "缺少收款账户"
		}
		out.Health = append(out.Health, state)
	}
	return out, nil
}

type Checkout struct {
	Order    *models.Order        `json:"order"`
	Merchant *models.Merchant     `json:"merchant"`
	Routes   map[string][]Option  `json:"routes"`
	Selected *models.PaymentRoute `json:"selected"`
	Help     map[string]string    `json:"help"`
}

type Option struct {
	MethodID int64   `json:"method_id"`
	Driver   string  `json:"driver"`
	Kind     string  `json:"kind"`
	Name     string  `json:"name"`
	Network  string  `json:"network"`
	Currency string  `json:"currency"`
	Amount   float64 `json:"amount"`
	Rate     float64 `json:"rate"`
}

func (a *App) BuildCheckout(orderID string) (*Checkout, error) {
	order, err := a.Models.GetOrder(orderID)
	if err != nil {
		return nil, err
	}
	merchant, err := a.Models.GetMerchantByID(order.MerchantID)
	if err != nil {
		return nil, err
	}
	methods, err := a.Models.ListPaymentMethods()
	if err != nil {
		return nil, err
	}
	groups := map[string][]Option{}
	for _, item := range methods {
		if !item.Enabled {
			continue
		}
		driver, ok := a.Registry.Driver(item.Driver)
		if !ok {
			continue
		}
		quotes, err := driver.Quote(payments.QuoteRequest{
			Method: payments.Method{
				ID:      item.ID,
				Name:    item.Name,
				Driver:  item.Driver,
				Kind:    item.Kind,
				Fields:  item.Fields,
				Enabled: item.Enabled,
			},
			FiatAmount:   order.FiatAmount,
			FiatCurrency: order.FiatCurrency,
		}, a)
		if err != nil {
			continue
		}
		for _, quote := range quotes {
			groups[quote.Currency] = append(groups[quote.Currency], Option{
				MethodID: quote.MethodID,
				Driver:   quote.Driver,
				Kind:     quote.Kind,
				Name:     quote.Name,
				Network:  quote.Network,
				Currency: quote.Currency,
				Amount:   quote.Amount,
				Rate:     quote.Rate,
			})
		}
	}
	return &Checkout{
		Order:    order,
		Merchant: merchant,
		Routes:   groups,
		Selected: order.Route,
		Help: map[string]string{
			"order_id": order.ID,
			"tips":     "付款时请严格核对网络、币种和金额，如遇延迟请联系商户并提供订单号。",
		},
	}, nil
}

func (a *App) SelectRoute(orderID string, methodID int64, currency string) (*models.PaymentRoute, error) {
	order, err := a.Models.GetOrder(orderID)
	if err != nil {
		return nil, err
	}
	if order.Status != models.OrderPending || time.Now().After(order.ExpireAt) {
		return nil, fmt.Errorf("订单已失效")
	}
	method, err := a.Models.GetPaymentMethod(methodID)
	if err != nil {
		return nil, err
	}
	driver, ok := a.Registry.Driver(method.Driver)
	if !ok {
		return nil, fmt.Errorf("支付驱动不存在")
	}
	route, err := driver.Assign(payments.AssignRequest{
		Method: payments.Method{
			ID:      method.ID,
			Name:    method.Name,
			Driver:  method.Driver,
			Kind:    method.Kind,
			Fields:  method.Fields,
			Enabled: method.Enabled,
		},
		FiatAmount:   order.FiatAmount,
		FiatCurrency: order.FiatCurrency,
		Currency:     currency,
	}, a)
	if err != nil {
		return nil, err
	}
	item := &models.PaymentRoute{
		OrderID:      orderID,
		MethodID:     route.MethodID,
		Driver:       route.Driver,
		Kind:         route.Kind,
		Network:      route.Network,
		Currency:     route.Currency,
		Amount:       route.Amount,
		Address:      route.Address,
		AccountName:  route.AccountName,
		Memo:         route.Memo,
		QRValue:      route.QRValue,
		Instructions: route.Instructions,
	}
	if err := a.Models.SaveRoute(item); err != nil {
		return nil, err
	}
	return item, nil
}

type MerchantOrderRequest struct {
	MerchantID      string  `json:"merchant_id"`
	MerchantOrderNo string  `json:"merchant_order_no"`
	Amount          float64 `json:"amount"`
	Currency        string  `json:"currency"`
	CallbackURL     string  `json:"callback_url"`
	RedirectURL     string  `json:"redirect_url"`
	CustomerRef     string  `json:"customer_ref"`
	Sign            string  `json:"sign"`
}

func (a *App) CreateMerchantOrder(apiKey string, req MerchantOrderRequest) (*models.Order, bool, error) {
	merchant, err := a.Models.GetMerchantByAPIKey(apiKey)
	if err != nil {
		return nil, false, err
	}
	payload := map[string]string{
		"merchant_id":       req.MerchantID,
		"merchant_order_no": req.MerchantOrderNo,
		"amount":            fmt.Sprintf("%g", req.Amount),
		"currency":          strings.ToUpper(strings.TrimSpace(req.Currency)),
		"callback_url":      strings.TrimSpace(req.CallbackURL),
		"redirect_url":      strings.TrimSpace(req.RedirectURL),
		"customer_ref":      strings.TrimSpace(req.CustomerRef),
	}
	if merchant.ID != strings.TrimSpace(req.MerchantID) {
		return nil, false, fmt.Errorf("merchant_id 无效")
	}
	if !verifySign(payload, merchant.SecretKey, req.Sign) {
		return nil, false, fmt.Errorf("签名校验失败")
	}
	existing, err := a.Models.GetOrderByMerchantRef(merchant.ID, req.MerchantOrderNo)
	if err == nil && existing != nil {
		if math.Abs(existing.FiatAmount-req.Amount) > 0.000001 || !strings.EqualFold(existing.FiatCurrency, req.Currency) {
			return nil, false, fmt.Errorf("merchant_order_no 已存在且参数不一致")
		}
		return existing, true, nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	timeout := 30 * time.Minute
	if raw := a.Models.GetConfig("timeout", "1800"); raw != "" {
		if sec, err := time.ParseDuration(raw + "s"); err == nil && sec > 0 {
			timeout = sec
		}
	}
	item := &models.Order{
		MerchantID:      merchant.ID,
		MerchantOrderNo: strings.TrimSpace(req.MerchantOrderNo),
		Source:          "merchant_api",
		CustomerRef:     strings.TrimSpace(req.CustomerRef),
		FiatAmount:      req.Amount,
		FiatCurrency:    strings.ToUpper(strings.TrimSpace(req.Currency)),
		Status:          models.OrderPending,
		CallbackURL:     first(strings.TrimSpace(req.CallbackURL), merchant.CallbackURL),
		RedirectURL:     strings.TrimSpace(req.RedirectURL),
		ExpireAt:        time.Now().Add(timeout),
	}
	if item.FiatCurrency == "" {
		item.FiatCurrency = a.BaseCurrency()
	}
	if err := a.Models.CreateOrder(item); err != nil {
		return nil, false, err
	}
	return item, false, nil
}

func (a *App) Orders(status string, limit int) ([]models.Order, error) {
	return a.Models.ListOrders(limit, status)
}

func (a *App) Order(orderID string) (*models.Order, error) {
	return a.Models.GetOrder(orderID)
}

func (a *App) Methods() ([]models.PaymentMethod, error) {
	return a.Models.ListPaymentMethods()
}

func (a *App) Merchants() ([]models.Merchant, error) {
	return a.Models.ListMerchants()
}

func (a *App) SaveMethod(item *models.PaymentMethod) error {
	if _, ok := a.Registry.Driver(item.Driver); !ok {
		return fmt.Errorf("支付驱动不存在")
	}
	if item.Name == "" {
		item.Name = item.Driver
	}
	return a.Models.SavePaymentMethod(item)
}

func (a *App) Settings() (map[string]string, error) {
	return a.Models.Configs()
}

func (a *App) SaveSettings(values map[string]string) error {
	return a.Models.SetConfigs(values)
}

func (a *App) SaveMerchant(item *models.Merchant) error {
	if strings.TrimSpace(item.Name) == "" {
		return fmt.Errorf("商户名称不能为空")
	}
	return a.Models.SaveMerchant(item)
}

func (a *App) MerchantByAPIKey(apiKey string) (*models.Merchant, error) {
	return a.Models.GetMerchantByAPIKey(apiKey)
}

func (a *App) DeleteMethod(id int64) error {
	return a.Models.DeletePaymentMethod(id)
}

func (a *App) DeleteMerchant(id string) error {
	return a.Models.DeleteMerchant(id)
}

func (a *App) CheckoutStatus(orderID string) (*models.Order, error) {
	order, err := a.Models.GetOrder(orderID)
	if err != nil {
		return nil, err
	}
	if order.Status == models.OrderPending && time.Now().After(order.ExpireAt) {
		_ = a.Models.MarkOrderExpired(order.ID)
		order.Status = models.OrderExpired
	}
	return order, nil
}

func (a *App) InlineOrder(amount float64, currency string, customerRef string) (*models.Order, error) {
	merchants, err := a.Models.ListMerchants()
	if err != nil {
		return nil, err
	}
	merchantID := "INLINE"
	if len(merchants) > 0 {
		merchantID = merchants[0].ID
	}
	item := &models.Order{
		MerchantID:      merchantID,
		MerchantOrderNo: fmt.Sprintf("inline-%d", time.Now().UnixNano()),
		Source:          "telegram_inline",
		CustomerRef:     customerRef,
		FiatAmount:      amount,
		FiatCurrency:    strings.ToUpper(first(currency, a.BaseCurrency())),
		Status:          models.OrderPending,
		ExpireAt:        time.Now().Add(30 * time.Minute),
	}
	if err := a.Models.CreateOrder(item); err != nil {
		return nil, err
	}
	return item, nil
}

func (a *App) PostCallback(task models.NotificationTask) error {
	order, err := a.Models.GetOrder(task.OrderID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(order.CallbackURL) == "" {
		return a.Models.MarkNotificationDone(task.ID)
	}

	body := strings.NewReader(fmt.Sprintf(`{"order_id":"%s","status":"%s","tx_hash":"%s","amount":%g,"currency":"%s"}`,
		order.ID, order.Status, order.TxHash, order.FiatAmount, order.FiatCurrency))
	req, err := http.NewRequest(http.MethodPost, order.CallbackURL, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("callback status %d", resp.StatusCode)
	}
	return nil
}

func first(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
