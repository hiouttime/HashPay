package scanner

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

func (t *TonAPI) ChainType() ChainType {
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
