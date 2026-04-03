package payments

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type Field struct {
	Key         string   `json:"key"`
	Label       string   `json:"label"`
	Type        string   `json:"type"`
	Required    bool     `json:"required"`
	Placeholder string   `json:"placeholder,omitempty"`
	Help        string   `json:"help,omitempty"`
	Options     []string `json:"options,omitempty"`
}

type Meta struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Kind        string   `json:"kind"`
	Networks    []string `json:"networks"`
	Currencies  []string `json:"currencies"`
	HasQRCode   bool     `json:"has_qr_code"`
	CanScan     bool     `json:"can_scan"`
	Description string   `json:"description"`
}

type Quote struct {
	MethodID int64   `json:"method_id"`
	Driver   string  `json:"driver"`
	Kind     string  `json:"kind"`
	Name     string  `json:"name"`
	Network  string  `json:"network"`
	Currency string  `json:"currency"`
	Amount   float64 `json:"amount"`
	Rate     float64 `json:"rate"`
}

type Route struct {
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
}

type Method struct {
	ID      int64
	Name    string
	Driver  string
	Kind    string
	Fields  map[string]string
	Enabled bool
}

type AssignRequest struct {
	Method       Method
	FiatAmount   float64
	FiatCurrency string
	Currency     string
}

type QuoteRequest struct {
	Method       Method
	FiatAmount   float64
	FiatCurrency string
}

type Driver interface {
	Meta() Meta
	FormSchema() []Field
	Quote(req QuoteRequest, fx Converter) ([]Quote, error)
	Assign(req AssignRequest, fx Converter) (*Route, error)
	Scanner(method Method, debug bool) Scanner
}

type Converter interface {
	Convert(amount float64, from, to string) float64
	Rate(from, to string) float64
}

type Registry struct {
	drivers map[string]Driver
}

func NewRegistry(items ...Driver) *Registry {
	r := &Registry{drivers: map[string]Driver{}}
	for _, item := range items {
		r.Register(item)
	}
	return r
}

func (r *Registry) Register(driver Driver) {
	if driver == nil {
		return
	}
	r.drivers[driver.Meta().ID] = driver
}

func (r *Registry) Driver(id string) (Driver, bool) {
	driver, ok := r.drivers[strings.TrimSpace(id)]
	return driver, ok
}

func (r *Registry) Catalog() []Meta {
	var list []Meta
	for _, item := range r.drivers {
		list = append(list, item.Meta())
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Kind == list[j].Kind {
			return list[i].Name < list[j].Name
		}
		return list[i].Kind < list[j].Kind
	})
	return list
}

func (r *Registry) Schemas() map[string][]Field {
	out := map[string][]Field{}
	for _, item := range r.drivers {
		out[item.Meta().ID] = item.FormSchema()
	}
	return out
}

func csvList(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		part = strings.ToUpper(strings.TrimSpace(part))
		if part == "" {
			continue
		}
		if _, ok := seen[part]; ok {
			continue
		}
		seen[part] = struct{}{}
		out = append(out, part)
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func routeAmount(req QuoteRequest, fx Converter, currency string) (float64, float64) {
	rate := fx.Rate(req.FiatCurrency, currency)
	return fx.Convert(req.FiatAmount, req.FiatCurrency, currency), rate
}

func floatField(fields map[string]string, key string, fallback float64) float64 {
	if fields == nil {
		return fallback
	}
	value := strings.TrimSpace(fields[key])
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func requireField(fields map[string]string, key, label string) (string, error) {
	value := strings.TrimSpace(fields[key])
	if value == "" {
		return "", fmt.Errorf("%s 不能为空", label)
	}
	return value, nil
}

func networkField(fields map[string]string, fallback string) string {
	if fields == nil {
		return fallback
	}
	return firstNonEmpty(strings.ToLower(strings.TrimSpace(fields["network"])), fallback)
}

func toleranceField(fields map[string]string, key string, fallback float64) float64 {
	return floatField(fields, key, fallback)
}

func defaultTitle(meta Meta, method Method) string {
	return firstNonEmpty(method.Name, meta.Name)
}
