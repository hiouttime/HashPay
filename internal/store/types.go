package store

import "time"

const (
	OrderPending = "pending"
	OrderPaid    = "paid"
	OrderExpired = "expired"
	OrderInvalid = "invalid"
)

const (
	NotifyPending = "pending"
	NotifyDone    = "done"
	NotifyRetry   = "retry"
	NotifyFailed  = "failed"
)

type AdminUser struct {
	ID        int64
	Username  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Merchant struct {
	ID          string
	Name        string
	APIKey      string
	SecretKey   string
	CallbackURL string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type PaymentMethod struct {
	ID        int64
	Driver    string
	Kind      string
	Name      string
	Enabled   bool
	Fields    map[string]string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Order struct {
	ID              string
	MerchantID      string
	MerchantOrderNo string
	Source          string
	CustomerRef     string
	FiatAmount      float64
	FiatCurrency    string
	Status          string
	CallbackURL     string
	RedirectURL     string
	TxHash          string
	NotifyStatus    string
	NotifyError     string
	NotifyAt        time.Time
	ExpireAt        time.Time
	PaidAt          time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
	Route           *PaymentRoute
}

type PaymentRoute struct {
	ID           string
	OrderID      string
	MethodID     int64
	Driver       string
	Kind         string
	Network      string
	Currency     string
	Amount       float64
	Address      string
	AccountName  string
	Memo         string
	QRValue      string
	Instructions string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type PaymentTx struct {
	ID        int64
	OrderID   string
	RouteID   string
	MethodID  int64
	Driver    string
	Network   string
	Currency  string
	TxHash    string
	FromAddr  string
	ToAddr    string
	Amount    float64
	CreatedAt time.Time
}

type NotificationTask struct {
	ID        int64
	OrderID   string
	Status    string
	Attempts  int
	LastError string
	NextRunAt time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}
