package test

import (
	"path/filepath"
	"testing"
	"time"

	"hashpay/internal/models"
)

func openTestModels(t *testing.T) *models.Models {
	t.Helper()
	db, err := models.Open("sqlite3", filepath.Join(t.TempDir(), "hashpay-test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.Migrate(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	return models.New(db)
}

func TestOrderRouteAndNotificationFlow(t *testing.T) {
	m := openTestModels(t)

	merchant := &models.Merchant{Name: "Merchant A", CallbackURL: "https://merchant.test/callback"}
	if err := m.SaveMerchant(merchant); err != nil {
		t.Fatalf("save merchant: %v", err)
	}

	method := &models.PaymentMethod{
		Driver:  "chain/tron",
		Kind:    "chain",
		Name:    "TRON",
		Enabled: true,
		Fields: map[string]string{
			"address":    "TTestAddress111111111111111111111111",
			"currencies": "USDT,TRX",
		},
	}
	if err := m.SavePaymentMethod(method); err != nil {
		t.Fatalf("save payment method: %v", err)
	}

	order := &models.Order{
		MerchantID:      merchant.ID,
		MerchantOrderNo: "m-1001",
		Source:          "merchant_api",
		FiatAmount:      100,
		FiatCurrency:    "CNY",
		ExpireAt:        time.Now().Add(10 * time.Minute),
	}
	if err := m.CreateOrder(order); err != nil {
		t.Fatalf("create order: %v", err)
	}

	route := &models.PaymentRoute{
		OrderID:      order.ID,
		MethodID:     method.ID,
		Driver:       method.Driver,
		Kind:         method.Kind,
		Network:      "tron",
		Currency:     "USDT",
		Amount:       13.88,
		Address:      method.Fields["address"],
		QRValue:      method.Fields["address"],
		Instructions: "pay on tron",
	}
	if err := m.SaveRoute(route); err != nil {
		t.Fatalf("save route: %v", err)
	}

	if err := m.QueueNotification(order.ID); err != nil {
		t.Fatalf("queue notification: %v", err)
	}

	got, err := m.GetOrder(order.ID)
	if err != nil {
		t.Fatalf("get order: %v", err)
	}
	if got.Route == nil {
		t.Fatalf("expected route on order")
	}
	if got.Route.Driver != "chain/tron" {
		t.Fatalf("unexpected route driver: %s", got.Route.Driver)
	}

	list, err := m.DueNotifications(10)
	if err != nil {
		t.Fatalf("due notifications: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(list))
	}

	if err := m.MarkNotificationRetry(list[0].ID, 1, "retry later", time.Now().Add(time.Minute)); err != nil {
		t.Fatalf("mark retry: %v", err)
	}
	if err := m.MarkOrderPaid(order.ID, "tx-1"); err != nil {
		t.Fatalf("mark paid: %v", err)
	}
	if err := m.SaveTx(&models.PaymentTx{
		OrderID:   order.ID,
		RouteID:   route.ID,
		MethodID:  method.ID,
		Driver:    route.Driver,
		Network:   route.Network,
		Currency:  route.Currency,
		TxHash:    "tx-1",
		ToAddr:    route.Address,
		Amount:    route.Amount,
		CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("save tx: %v", err)
	}

	hasTx, err := m.HasTx("tx-1")
	if err != nil {
		t.Fatalf("has tx: %v", err)
	}
	if !hasTx {
		t.Fatalf("expected tx to exist")
	}
}
