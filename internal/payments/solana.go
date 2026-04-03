package payments

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type SolanaAPI struct {
	rpcURL      string
	client      *http.Client
	tokenByMint map[string]string
}

type solTokenBalance struct {
	Owner         string `json:"owner"`
	Mint          string `json:"mint"`
	UiTokenAmount struct {
		UiAmountString string `json:"uiAmountString"`
	} `json:"uiTokenAmount"`
}

type solParsedTx struct {
	BlockTime   int64 `json:"blockTime"`
	Transaction struct {
		Message struct {
			AccountKeys []any `json:"accountKeys"`
		} `json:"message"`
	} `json:"transaction"`
	Meta struct {
		PreBalances       []int64           `json:"preBalances"`
		PostBalances      []int64           `json:"postBalances"`
		PreTokenBalances  []solTokenBalance `json:"preTokenBalances"`
		PostTokenBalances []solTokenBalance `json:"postTokenBalances"`
	} `json:"meta"`
}

func NewSolanaAPI(rpcURL string) *SolanaAPI {
	tokenByMint := map[string]string{
		"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
		"Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
	}
	if strings.Contains(strings.ToLower(strings.TrimSpace(rpcURL)), "devnet") {
		tokenByMint = map[string]string{
			"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC",
		}
	}

	return &SolanaAPI{
		rpcURL:      rpcURL,
		client:      &http.Client{Timeout: 15 * time.Second},
		tokenByMint: tokenByMint,
	}
}

func (s *SolanaAPI) ChainType() Chain {
	return ChainSolana
}

func (s *SolanaAPI) GetTransactions(addr string, fromTime int64) ([]Transaction, error) {
	signatures, err := s.getSignatures(addr)
	if err != nil {
		return nil, err
	}

	txs := make([]Transaction, 0, 16)
	for _, sig := range signatures {
		if sig.BlockTime > 0 && sig.BlockTime < fromTime {
			continue
		}
		if sig.Err != nil {
			continue
		}

		parsed, err := s.getParsedTransaction(sig.Signature)
		if err != nil {
			continue
		}

		ts := parsed.BlockTime
		if ts <= 0 {
			ts = sig.BlockTime
		}
		if ts > 0 && ts < fromTime {
			continue
		}

		nativeAmount := solNativeAmount(addr, parsed)
		if nativeAmount.GreaterThan(decimal.Zero) {
			txs = append(txs, Transaction{
				Hash:      sig.Signature,
				Chain:     ChainSolana,
				To:        addr,
				Amount:    nativeAmount,
				Currency:  "SOL",
				Timestamp: ts,
			})
		}

		for mint, delta := range solTokenDelta(addr, parsed, s.tokenByMint) {
			if delta.LessThanOrEqual(decimal.Zero) {
				continue
			}
			txs = append(txs, Transaction{
				Hash:      sig.Signature,
				Chain:     ChainSolana,
				To:        addr,
				Amount:    delta,
				Currency:  s.tokenByMint[mint],
				Timestamp: ts,
			})
		}
	}

	return txs, nil
}

func (s *SolanaAPI) GetTransaction(hash string) (*Transaction, error) {
	return nil, nil
}

func (s *SolanaAPI) ValidateAddress(addr string) bool {
	size := len(strings.TrimSpace(addr))
	return size >= 32 && size <= 44
}

func (s *SolanaAPI) getSignatures(addr string) ([]struct {
	Signature string `json:"signature"`
	BlockTime int64  `json:"blockTime"`
	Err       any    `json:"err"`
}, error) {
	var result []struct {
		Signature string `json:"signature"`
		BlockTime int64  `json:"blockTime"`
		Err       any    `json:"err"`
	}
	err := s.rpcCall("getSignaturesForAddress", []any{
		addr,
		map[string]any{"limit": 80},
	}, &result)
	return result, err
}

func (s *SolanaAPI) getParsedTransaction(signature string) (solParsedTx, error) {
	var result solParsedTx

	err := s.rpcCall("getTransaction", []any{
		signature,
		map[string]any{
			"encoding":                       "jsonParsed",
			"maxSupportedTransactionVersion": 0,
		},
	}, &result)
	return result, err
}

func (s *SolanaAPI) rpcCall(method string, params any, out any) error {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, s.rpcURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return err
	}
	if envelope.Error != nil {
		return fmt.Errorf("rpc error %d: %s", envelope.Error.Code, envelope.Error.Message)
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(envelope.Result, out)
}

func solNativeAmount(addr string, tx solParsedTx) decimal.Decimal {
	keys := tx.Transaction.Message.AccountKeys
	for i := 0; i < len(keys); i++ {
		if i >= len(tx.Meta.PreBalances) || i >= len(tx.Meta.PostBalances) {
			continue
		}

		key := solAccountKey(keys[i])
		if key != addr {
			continue
		}

		diff := tx.Meta.PostBalances[i] - tx.Meta.PreBalances[i]
		if diff <= 0 {
			return decimal.Zero
		}
		return decimal.NewFromInt(diff).Div(decimal.New(1, 9))
	}
	return decimal.Zero
}

func solTokenDelta(addr string, tx solParsedTx, tokenByMint map[string]string) map[string]decimal.Decimal {
	pre := make(map[string]decimal.Decimal)
	for _, item := range tx.Meta.PreTokenBalances {
		if item.Owner != addr || item.Mint == "" {
			continue
		}
		if _, ok := tokenByMint[item.Mint]; !ok {
			continue
		}
		val, err := decimal.NewFromString(item.UiTokenAmount.UiAmountString)
		if err != nil {
			continue
		}
		pre[item.Mint] = pre[item.Mint].Add(val)
	}

	delta := make(map[string]decimal.Decimal)
	for _, item := range tx.Meta.PostTokenBalances {
		if item.Owner != addr || item.Mint == "" {
			continue
		}
		if _, ok := tokenByMint[item.Mint]; !ok {
			continue
		}
		val, err := decimal.NewFromString(item.UiTokenAmount.UiAmountString)
		if err != nil {
			continue
		}
		delta[item.Mint] = delta[item.Mint].Add(val)
	}

	for mint, nowVal := range delta {
		delta[mint] = nowVal.Sub(pre[mint])
	}
	return delta
}

type solanaDriver struct{}

func (d solanaDriver) Meta() Meta {
	return Meta{
		ID:          "chain/solana",
		Name:        "Solana",
		Kind:        "chain",
		Networks:    []string{"solana"},
		Currencies:  []string{"USDT", "SOL"},
		HasQRCode:   true,
		CanScan:     true,
		Description: "Solana 链地址收款",
	}
}

func (d solanaDriver) FormSchema() []Field {
	return []Field{
		{Key: "name", Label: "显示名称", Type: "text", Required: true, Placeholder: "Solana 地址"},
		{Key: "address", Label: "收款地址", Type: "text", Required: true},
		{Key: "currencies", Label: "支持币种", Type: "text", Required: true, Placeholder: "USDT,SOL"},
		{Key: "confirm_tolerance", Label: "金额容差", Type: "number", Placeholder: "0.000001"},
	}
}

func (d solanaDriver) Quote(req QuoteRequest, fx Converter) ([]Quote, error) {
	currencies := csvList(firstNonEmpty(req.Method.Fields["currencies"], "USDT,SOL"))
	out := make([]Quote, 0, len(currencies))
	for _, currency := range currencies {
		amount, rate := routeAmount(req, fx, currency)
		out = append(out, Quote{
			MethodID: req.Method.ID,
			Driver:   d.Meta().ID,
			Kind:     d.Meta().Kind,
			Name:     defaultTitle(d.Meta(), req.Method),
			Network:  "solana",
			Currency: currency,
			Amount:   amount,
			Rate:     rate,
		})
	}
	return out, nil
}

func (d solanaDriver) Assign(req AssignRequest, fx Converter) (*Route, error) {
	address, err := requireField(req.Method.Fields, "address", "收款地址")
	if err != nil {
		return nil, err
	}
	return &Route{
		MethodID:     req.Method.ID,
		Driver:       d.Meta().ID,
		Kind:         d.Meta().Kind,
		Network:      "solana",
		Currency:     strings.ToUpper(req.Currency),
		Amount:       fx.Convert(req.FiatAmount, req.FiatCurrency, req.Currency),
		Address:      address,
		QRValue:      address,
		Instructions: "请通过 Solana 网络付款，并确认币种和金额完全一致。",
	}, nil
}

func (d solanaDriver) Scanner(method Method, debug bool) Scanner {
	return chainScanner{
		api:       NewSolanaAPI(solanaURL(debug)),
		chain:     ChainSolana,
		tolerance: toleranceField(method.Fields, "confirm_tolerance", 0.000001),
	}
}

func solAccountKey(raw any) string {
	switch v := raw.(type) {
	case string:
		return v
	case map[string]any:
		if pub, ok := v["pubkey"].(string); ok {
			return pub
		}
	}
	return ""
}
