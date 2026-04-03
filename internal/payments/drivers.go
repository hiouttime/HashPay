package payments

import (
	"fmt"
	"strings"
)

type chainDriver struct {
	meta Meta
}

func (d chainDriver) Meta() Meta {
	return d.meta
}

func (d chainDriver) FormSchema() []Field {
	return []Field{
		{Key: "name", Label: "显示名称", Type: "text", Required: true, Placeholder: d.meta.Name},
		{Key: "address", Label: "收款地址", Type: "text", Required: true, Help: "链上用户付款时看到的收款地址"},
		{Key: "currencies", Label: "支持币种", Type: "text", Required: true, Placeholder: strings.Join(d.meta.Currencies, ","), Help: "使用逗号分隔，例如 USDT,TRX"},
		{Key: "confirm_tolerance", Label: "金额容差", Type: "number", Placeholder: "0.000001", Help: "扫描匹配时允许的金额误差"},
		{Key: "api_key", Label: "扫描 API Key", Type: "text", Help: "链上扫描需要时填写，例如 TronGrid 或交易所 API"},
	}
}

func (d chainDriver) Quote(req QuoteRequest, fx Converter) ([]Quote, error) {
	currencies := csvList(firstNonEmpty(req.Method.Fields["currencies"], strings.Join(d.meta.Currencies, ",")))
	if len(currencies) == 0 {
		currencies = d.meta.Currencies
	}
	list := make([]Quote, 0, len(currencies))
	for _, currency := range currencies {
		amount, rate := routeAmount(req, fx, currency)
		list = append(list, Quote{
			MethodID: req.Method.ID,
			Driver:   d.meta.ID,
			Kind:     d.meta.Kind,
			Name:     firstNonEmpty(req.Method.Name, d.meta.Name),
			Network:  d.meta.Networks[0],
			Currency: currency,
			Amount:   amount,
			Rate:     rate,
		})
	}
	return list, nil
}

func (d chainDriver) Assign(req AssignRequest, fx Converter) (*Route, error) {
	address, err := requireField(req.Method.Fields, "address", "收款地址")
	if err != nil {
		return nil, err
	}
	amount := fx.Convert(req.FiatAmount, req.FiatCurrency, req.Currency)
	return &Route{
		MethodID:     req.Method.ID,
		Driver:       d.meta.ID,
		Kind:         d.meta.Kind,
		Network:      d.meta.Networks[0],
		Currency:     strings.ToUpper(req.Currency),
		Amount:       amount,
		Address:      address,
		QRValue:      address,
		Instructions: fmt.Sprintf("请通过 %s 网络转账，并确保到账金额与页面一致。", d.meta.Name),
	}, nil
}

type exchangeDriver struct {
	meta Meta
}

func (d exchangeDriver) Meta() Meta {
	return d.meta
}

func (d exchangeDriver) FormSchema() []Field {
	return []Field{
		{Key: "name", Label: "显示名称", Type: "text", Required: true, Placeholder: d.meta.Name},
		{Key: "account_name", Label: "收款账户", Type: "text", Required: true, Help: "例如 UID、邮箱、用户名"},
		{Key: "memo", Label: "转账备注", Type: "text", Help: "需要用户额外备注时填写"},
		{Key: "currencies", Label: "支持币种", Type: "text", Required: true, Placeholder: strings.Join(d.meta.Currencies, ",")},
		{Key: "instructions", Label: "付款说明", Type: "textarea", Help: "给付款用户展示的操作步骤"},
		{Key: "amount_tolerance", Label: "金额容差", Type: "number", Placeholder: "0.01", Help: "内部转账到账允许误差"},
	}
}

func (d exchangeDriver) Quote(req QuoteRequest, fx Converter) ([]Quote, error) {
	currencies := csvList(firstNonEmpty(req.Method.Fields["currencies"], strings.Join(d.meta.Currencies, ",")))
	list := make([]Quote, 0, len(currencies))
	for _, currency := range currencies {
		amount, rate := routeAmount(req, fx, currency)
		list = append(list, Quote{
			MethodID: req.Method.ID,
			Driver:   d.meta.ID,
			Kind:     d.meta.Kind,
			Name:     firstNonEmpty(req.Method.Name, d.meta.Name),
			Network:  d.meta.Networks[0],
			Currency: currency,
			Amount:   amount,
			Rate:     rate,
		})
	}
	return list, nil
}

func (d exchangeDriver) Assign(req AssignRequest, fx Converter) (*Route, error) {
	accountName, err := requireField(req.Method.Fields, "account_name", "收款账户")
	if err != nil {
		return nil, err
	}
	amount := fx.Convert(req.FiatAmount, req.FiatCurrency, req.Currency)
	instructions := firstNonEmpty(req.Method.Fields["instructions"], "请通过交易所内部转账完成付款，并核对收款账户与备注。")
	return &Route{
		MethodID:     req.Method.ID,
		Driver:       d.meta.ID,
		Kind:         d.meta.Kind,
		Network:      d.meta.Networks[0],
		Currency:     strings.ToUpper(req.Currency),
		Amount:       amount,
		AccountName:  accountName,
		Memo:         strings.TrimSpace(req.Method.Fields["memo"]),
		Instructions: instructions,
		QRValue:      "",
	}, nil
}

func DefaultRegistry() *Registry {
	return NewRegistry(
		chainDriver{meta: Meta{ID: "chain/tron", Name: "TRON", Kind: "chain", Networks: []string{"tron"}, Currencies: []string{"USDT", "TRX"}, HasQRCode: true, CanScan: true, Description: "TRON 链上地址收款"}},
		chainDriver{meta: Meta{ID: "chain/evm", Name: "EVM", Kind: "chain", Networks: []string{"eth"}, Currencies: []string{"USDT", "USDC", "ETH"}, HasQRCode: true, CanScan: true, Description: "Ethereum / BSC / Polygon 共享驱动"}},
		chainDriver{meta: Meta{ID: "chain/solana", Name: "Solana", Kind: "chain", Networks: []string{"solana"}, Currencies: []string{"USDT", "SOL"}, HasQRCode: true, CanScan: true, Description: "Solana 链上地址收款"}},
		chainDriver{meta: Meta{ID: "chain/ton", Name: "TON", Kind: "chain", Networks: []string{"ton"}, Currencies: []string{"USDT", "TON"}, HasQRCode: true, CanScan: true, Description: "TON 链上地址收款"}},
		exchangeDriver{meta: Meta{ID: "exchange/binance", Name: "Binance 内转", Kind: "exchange", Networks: []string{"binance"}, Currencies: []string{"USDT", "BTC", "ETH"}, HasQRCode: false, CanScan: false, Description: "交易所内部转账收款"}},
	)
}
