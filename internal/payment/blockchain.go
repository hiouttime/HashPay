package payment

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
)

type TronAPI struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

func NewTronAPI(endpoint, apiKey string) *TronAPI {
	return &TronAPI{
		endpoint: endpoint,
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (t *TronAPI) GetTxs(addr string, from int64) ([]Transaction, error) {
	url := fmt.Sprintf("%s/v1/accounts/%s/transactions/trc20?limit=50&only_confirmed=true&min_timestamp=%d",
		t.endpoint, addr, from*1000)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	
	if t.apiKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", t.apiKey)
	}
	
	resp, err := t.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Data []struct {
			TransactionID string `json:"transaction_id"`
			From          string `json:"from"`
			To            string `json:"to"`
			Value         string `json:"value"`
			TokenInfo     struct {
				Symbol   string `json:"symbol"`
				Decimals int    `json:"decimals"`
			} `json:"token_info"`
			BlockTimestamp int64 `json:"block_timestamp"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, tx := range result.Data {
		amount, _ := decimal.NewFromString(tx.Value)
		decimals := decimal.NewFromInt(10).Pow(decimal.NewFromInt(int64(tx.TokenInfo.Decimals)))
		amount = amount.Div(decimals)
		
		txs = append(txs, Transaction{
			Hash:      tx.TransactionID,
			From:      tx.From,
			To:        tx.To,
			Amount:    amount,
			Currency:  tx.TokenInfo.Symbol,
			Timestamp: tx.BlockTimestamp / 1000,
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (t *TronAPI) GetTx(hash string) (*Transaction, error) {
	url := fmt.Sprintf("%s/v1/transactions/%s", t.endpoint, hash)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	
	if t.apiKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", t.apiKey)
	}
	
	resp, err := t.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("transaction not found")
	}
	
	return &Transaction{Hash: hash, Status: "confirmed"}, nil
}

func (t *TronAPI) ValidateAddr(addr string) bool {
	return len(addr) == 34 && (addr[0] == 'T')
}

type BSCAPI struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

func NewBSCAPI(endpoint, apiKey string) *BSCAPI {
	return &BSCAPI{
		endpoint: endpoint,
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (b *BSCAPI) GetTxs(addr string, from int64) ([]Transaction, error) {
	url := fmt.Sprintf("%s/api?module=account&action=tokentx&address=%s&startblock=%d&sort=desc&apikey=%s",
		b.endpoint, addr, from, b.apiKey)
	
	resp, err := b.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Status  string `json:"status"`
		Message string `json:"message"`
		Result  []struct {
			Hash         string `json:"hash"`
			From         string `json:"from"`
			To           string `json:"to"`
			Value        string `json:"value"`
			TokenSymbol  string `json:"tokenSymbol"`
			TokenDecimal string `json:"tokenDecimal"`
			TimeStamp    string `json:"timeStamp"`
		} `json:"result"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, tx := range result.Result {
		amount, _ := decimal.NewFromString(tx.Value)
		decimals, _ := decimal.NewFromString(tx.TokenDecimal)
		divisor := decimal.NewFromInt(10).Pow(decimals)
		amount = amount.Div(divisor)
		
		timestamp, _ := decimal.NewFromString(tx.TimeStamp)
		
		txs = append(txs, Transaction{
			Hash:      tx.Hash,
			From:      tx.From,
			To:        tx.To,
			Amount:    amount,
			Currency:  tx.TokenSymbol,
			Timestamp: timestamp.IntPart(),
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (b *BSCAPI) GetTx(hash string) (*Transaction, error) {
	url := fmt.Sprintf("%s/api?module=transaction&action=gettxreceiptstatus&txhash=%s&apikey=%s",
		b.endpoint, hash, b.apiKey)
	
	resp, err := b.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	var result struct {
		Status string `json:"status"`
		Result struct {
			Status string `json:"status"`
		} `json:"result"`
	}
	
	body, _ := ioutil.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	if result.Result.Status == "1" {
		return &Transaction{Hash: hash, Status: "confirmed"}, nil
	}
	
	return nil, fmt.Errorf("transaction failed or not found")
}

func (b *BSCAPI) ValidateAddr(addr string) bool {
	return len(addr) == 42 && addr[0:2] == "0x"
}