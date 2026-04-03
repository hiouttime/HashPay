package payments

import (
	"strings"
)

type binanceDriver struct{}

func (d binanceDriver) Meta() Meta {
	return Meta{
		ID:          "exchange/binance",
		Name:        "Binance 内转",
		Kind:        "exchange",
		Networks:    []string{"binance"},
		Currencies:  []string{"USDT", "BTC", "ETH"},
		HasQRCode:   false,
		CanScan:     false,
		Description: "交易所内部转账收款",
	}
}

func (d binanceDriver) FormSchema() []Field {
	return []Field{
		{Key: "name", Label: "显示名称", Type: "text", Required: true, Placeholder: "Binance 主账号"},
		{Key: "account_name", Label: "收款账户", Type: "text", Required: true},
		{Key: "memo", Label: "转账备注", Type: "text"},
		{Key: "currencies", Label: "支持币种", Type: "text", Required: true, Placeholder: "USDT,BTC,ETH"},
		{Key: "instructions", Label: "付款说明", Type: "textarea"},
		{Key: "amount_tolerance", Label: "金额容差", Type: "number", Placeholder: "0.01"},
	}
}

func (d binanceDriver) Quote(req QuoteRequest, fx Converter) ([]Quote, error) {
	currencies := csvList(firstNonEmpty(req.Method.Fields["currencies"], strings.Join(d.Meta().Currencies, ",")))
	out := make([]Quote, 0, len(currencies))
	for _, currency := range currencies {
		amount, rate := routeAmount(req, fx, currency)
		out = append(out, Quote{
			MethodID: req.Method.ID,
			Driver:   d.Meta().ID,
			Kind:     d.Meta().Kind,
			Name:     defaultTitle(d.Meta(), req.Method),
			Network:  "binance",
			Currency: currency,
			Amount:   amount,
			Rate:     rate,
		})
	}
	return out, nil
}

func (d binanceDriver) Assign(req AssignRequest, fx Converter) (*Route, error) {
	accountName, err := requireField(req.Method.Fields, "account_name", "收款账户")
	if err != nil {
		return nil, err
	}
	return &Route{
		MethodID:     req.Method.ID,
		Driver:       d.Meta().ID,
		Kind:         d.Meta().Kind,
		Network:      "binance",
		Currency:     strings.ToUpper(req.Currency),
		Amount:       fx.Convert(req.FiatAmount, req.FiatCurrency, req.Currency),
		AccountName:  accountName,
		Memo:         strings.TrimSpace(req.Method.Fields["memo"]),
		Instructions: firstNonEmpty(req.Method.Fields["instructions"], "请通过 Binance 内部转账完成付款，并核对收款账户与备注。"),
	}, nil
}

func (d binanceDriver) Scanner(method Method, debug bool) Scanner {
	return nil
}
