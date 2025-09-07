package payment

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
)

type TONAPI struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

func NewTONAPI(endpoint, apiKey string) *TONAPI {
	return &TONAPI{
		endpoint: endpoint,
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (t *TONAPI) GetTxs(addr string, from int64) ([]Transaction, error) {
	// 使用 TON Center API
	url := fmt.Sprintf("%s/api/v2/getTransactions?address=%s&limit=50&api_key=%s",
		t.endpoint, addr, t.apiKey)
	
	resp, err := t.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Ok     bool `json:"ok"`
		Result []struct {
			TransactionID struct {
				Hash string `json:"hash"`
			} `json:"transaction_id"`
			InMsg struct {
				Source      string `json:"source"`
				Destination string `json:"destination"`
				Value       string `json:"value"`
				Message     string `json:"message"`
			} `json:"in_msg"`
			Fee        string `json:"fee"`
			Utime      int64  `json:"utime"`
		} `json:"result"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	if !result.Ok {
		return nil, fmt.Errorf("TON API error")
	}
	
	var txs []Transaction
	for _, tx := range result.Result {
		if tx.Utime < from || tx.InMsg.Destination != addr {
			continue
		}
		
		// TON 金额单位是 nanoton，1 TON = 10^9 nanoton
		amount, _ := decimal.NewFromString(tx.InMsg.Value)
		amount = amount.Div(decimal.NewFromInt(1000000000))
		
		txs = append(txs, Transaction{
			Hash:      tx.TransactionID.Hash,
			From:      tx.InMsg.Source,
			To:        tx.InMsg.Destination,
			Amount:    amount,
			Currency:  "TON",
			Timestamp: tx.Utime,
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (t *TONAPI) GetTx(hash string) (*Transaction, error) {
	// TON 交易查询需要知道地址
	// 这里简化处理，实际需要更复杂的查询逻辑
	return &Transaction{Hash: hash, Status: "confirmed"}, nil
}

func (t *TONAPI) ValidateAddr(addr string) bool {
	// TON 地址有多种格式，这里简单检查长度
	return len(addr) >= 48 && len(addr) <= 67
}

type TonScanAPI struct {
	endpoint string
	client   *http.Client
}

func NewTonScanAPI() *TonScanAPI {
	return &TonScanAPI{
		endpoint: "https://toncenter.com",
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (t *TonScanAPI) GetTxs(addr string, from int64) ([]Transaction, error) {
	// TonScan API for Jetton (TON token) transfers
	url := fmt.Sprintf("%s/api/v3/jetton/transfers?account=%s&limit=50",
		t.endpoint, addr)
	
	resp, err := t.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Transfers []struct {
			QueryID         string `json:"query_id"`
			Source          string `json:"source"`
			Destination     string `json:"destination"`
			Amount          string `json:"amount"`
			JettonMaster    string `json:"jetton_master"`
			Symbol          string `json:"symbol"`
			TransactionHash string `json:"transaction_hash"`
			TransactionTime int64  `json:"transaction_time"`
		} `json:"transfers"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, transfer := range result.Transfers {
		if transfer.TransactionTime < from || transfer.Destination != addr {
			continue
		}
		
		amount, _ := decimal.NewFromString(transfer.Amount)
		// Jetton 通常有不同的精度，这里假设 6 位小数
		amount = amount.Div(decimal.NewFromInt(1000000))
		
		txs = append(txs, Transaction{
			Hash:      transfer.TransactionHash,
			From:      transfer.Source,
			To:        transfer.Destination,
			Amount:    amount,
			Currency:  transfer.Symbol,
			Timestamp: transfer.TransactionTime,
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (t *TonScanAPI) GetTx(hash string) (*Transaction, error) {
	url := fmt.Sprintf("%s/api/v3/transaction?hash=%s", t.endpoint, hash)
	
	resp, err := t.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("transaction not found")
	}
	
	return &Transaction{Hash: hash, Status: "confirmed"}, nil
}

func (t *TonScanAPI) ValidateAddr(addr string) bool {
	return len(addr) >= 48 && len(addr) <= 67
}

// TON Jetton (USDT on TON) 支持
type TONJettonAPI struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

func NewTONJettonAPI(endpoint, apiKey string) *TONJettonAPI {
	return &TONJettonAPI{
		endpoint: endpoint,
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (tj *TONJettonAPI) GetUSDTTransfers(addr string, from int64) ([]Transaction, error) {
	// TON 上的 USDT 合约地址
	usdtContract := "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"
	
	url := fmt.Sprintf("%s/api/v2/getJettonTransfers?address=%s&jetton_master=%s&limit=50&api_key=%s",
		tj.endpoint, addr, usdtContract, tj.apiKey)
	
	resp, err := tj.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Ok     bool `json:"ok"`
		Result struct {
			Transfers []struct {
				QueryID         string `json:"query_id"`
				Source          string `json:"source"`
				Destination     string `json:"destination"`
				Amount          string `json:"amount"`
				TransactionHash string `json:"transaction_hash"`
				Utime           int64  `json:"utime"`
			} `json:"transfers"`
		} `json:"result"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, transfer := range result.Result.Transfers {
		if transfer.Utime < from || transfer.Destination != addr {
			continue
		}
		
		// USDT on TON has 6 decimals
		amount, _ := decimal.NewFromString(transfer.Amount)
		amount = amount.Div(decimal.NewFromInt(1000000))
		
		txs = append(txs, Transaction{
			Hash:      transfer.TransactionHash,
			From:      transfer.Source,
			To:        transfer.Destination,
			Amount:    amount,
			Currency:  "USDT",
			Timestamp: transfer.Utime,
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}