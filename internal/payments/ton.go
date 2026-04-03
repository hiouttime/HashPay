package payments

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type TonAPI struct {
	baseURL string
	client  *http.Client
}

func NewTonAPI(baseURL string) *TonAPI {
	return &TonAPI{
		baseURL: strings.TrimRight(baseURL, "/"),
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (t *TonAPI) ChainType() Chain {
	return ChainTON
}

func (t *TonAPI) GetTransactions(addr string, fromTime int64) ([]Transaction, error) {
	if !t.ValidateAddress(addr) {
		return nil, fmt.Errorf("无效地址")
	}

	apiURL := fmt.Sprintf("%s/getTransactions?address=%s&limit=50&archival=false",
		t.baseURL, url.QueryEscape(addr))

	resp, err := t.client.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		OK     bool `json:"ok"`
		Result []struct {
			Utime         int64 `json:"utime"`
			TransactionID struct {
				Hash string `json:"hash"`
			} `json:"transaction_id"`
			InMsg struct {
				Source      string `json:"source"`
				Destination string `json:"destination"`
				Value       string `json:"value"`
			} `json:"in_msg"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if !result.OK {
		return nil, fmt.Errorf("toncenter 返回失败")
	}

	txs := make([]Transaction, 0, 8)
	for _, item := range result.Result {
		if item.Utime < fromTime {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(item.InMsg.Destination), strings.TrimSpace(addr)) {
			continue
		}

		value, err := decimal.NewFromString(item.InMsg.Value)
		if err != nil || value.LessThanOrEqual(decimal.Zero) {
			continue
		}

		txs = append(txs, Transaction{
			Hash:      item.TransactionID.Hash,
			Chain:     ChainTON,
			From:      item.InMsg.Source,
			To:        item.InMsg.Destination,
			Amount:    value.Div(decimal.New(1, 9)),
			Currency:  "TON",
			Timestamp: item.Utime,
		})
	}

	return txs, nil
}

func (t *TonAPI) GetTransaction(hash string) (*Transaction, error) {
	return nil, nil
}

func (t *TonAPI) ValidateAddress(addr string) bool {
	return strings.TrimSpace(addr) != ""
}

type tonDriver struct{}

func (d tonDriver) Meta() Meta {
	return Meta{
		ID:          "chain/ton",
		Name:        "TON",
		Kind:        "chain",
		Networks:    []string{"ton"},
		Currencies:  []string{"USDT", "TON"},
		HasQRCode:   true,
		CanScan:     true,
		Description: "TON 链地址收款",
	}
}

func (d tonDriver) FormSchema() []Field {
	return []Field{
		{Key: "name", Label: "显示名称", Type: "text", Required: true, Placeholder: "TON 地址"},
		{Key: "address", Label: "收款地址", Type: "text", Required: true},
		{Key: "currencies", Label: "支持币种", Type: "text", Required: true, Placeholder: "USDT,TON"},
		{Key: "confirm_tolerance", Label: "金额容差", Type: "number", Placeholder: "0.000001"},
	}
}

func (d tonDriver) Quote(req QuoteRequest, fx Converter) ([]Quote, error) {
	currencies := csvList(firstNonEmpty(req.Method.Fields["currencies"], "USDT,TON"))
	out := make([]Quote, 0, len(currencies))
	for _, currency := range currencies {
		amount, rate := routeAmount(req, fx, currency)
		out = append(out, Quote{
			MethodID: req.Method.ID,
			Driver:   d.Meta().ID,
			Kind:     d.Meta().Kind,
			Name:     defaultTitle(d.Meta(), req.Method),
			Network:  "ton",
			Currency: currency,
			Amount:   amount,
			Rate:     rate,
		})
	}
	return out, nil
}

func (d tonDriver) Assign(req AssignRequest, fx Converter) (*Route, error) {
	address, err := requireField(req.Method.Fields, "address", "收款地址")
	if err != nil {
		return nil, err
	}
	return &Route{
		MethodID:     req.Method.ID,
		Driver:       d.Meta().ID,
		Kind:         d.Meta().Kind,
		Network:      "ton",
		Currency:     strings.ToUpper(req.Currency),
		Amount:       fx.Convert(req.FiatAmount, req.FiatCurrency, req.Currency),
		Address:      address,
		QRValue:      address,
		Instructions: "请通过 TON 网络付款，并确认币种和金额完全一致。",
	}, nil
}

func (d tonDriver) Scanner(method Method, debug bool) Scanner {
	return chainScanner{
		api:       NewTonAPI(tonURL(debug)),
		chain:     ChainTON,
		tolerance: toleranceField(method.Fields, "confirm_tolerance", 0.000001),
	}
}
