package payment

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
)

type SolanaAPI struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

func NewSolanaAPI(endpoint, apiKey string) *SolanaAPI {
	return &SolanaAPI{
		endpoint: endpoint,
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *SolanaAPI) GetTxs(addr string, from int64) ([]Transaction, error) {
	// 使用 Solana RPC API
	payload := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "getSignaturesForAddress",
		"params": []interface{}{
			addr,
			map[string]interface{}{
				"limit": 50,
			},
		},
	}
	
	jsonData, _ := json.Marshal(payload)
	
	req, err := http.NewRequest("POST", s.endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Content-Type", "application/json")
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
	}
	
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Result []struct {
			Signature        string `json:"signature"`
			Slot            int64  `json:"slot"`
			BlockTime       int64  `json:"blockTime"`
			ConfirmationStatus string `json:"confirmationStatus"`
		} `json:"result"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, sig := range result.Result {
		if sig.BlockTime < from || sig.ConfirmationStatus != "finalized" {
			continue
		}
		
		// 获取交易详情
		tx, err := s.getTransactionDetail(sig.Signature)
		if err != nil {
			continue
		}
		
		if tx != nil && tx.To == addr {
			tx.Timestamp = sig.BlockTime
			txs = append(txs, *tx)
		}
	}
	
	return txs, nil
}

func (s *SolanaAPI) getTransactionDetail(signature string) (*Transaction, error) {
	payload := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "getTransaction",
		"params": []interface{}{
			signature,
			map[string]string{
				"encoding": "json",
			},
		},
	}
	
	jsonData, _ := json.Marshal(payload)
	
	req, err := http.NewRequest("POST", s.endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Content-Type", "application/json")
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
	}
	
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Result struct {
			Meta struct {
				PreBalances  []int64 `json:"preBalances"`
				PostBalances []int64 `json:"postBalances"`
			} `json:"meta"`
			Transaction struct {
				Message struct {
					AccountKeys []string `json:"accountKeys"`
				} `json:"message"`
			} `json:"transaction"`
		} `json:"result"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	// 简化处理：计算余额变化
	if len(result.Result.Meta.PreBalances) >= 2 && len(result.Result.Meta.PostBalances) >= 2 {
		// 接收方余额增加
		amount := result.Result.Meta.PostBalances[1] - result.Result.Meta.PreBalances[1]
		if amount > 0 {
			// SOL 使用 lamports，1 SOL = 10^9 lamports
			amountDecimal := decimal.NewFromInt(amount).Div(decimal.NewFromInt(1000000000))
			
			return &Transaction{
				Hash:     signature,
				To:       result.Result.Transaction.Message.AccountKeys[1],
				Amount:   amountDecimal,
				Currency: "SOL",
				Status:   "confirmed",
			}, nil
		}
	}
	
	return nil, nil
}

func (s *SolanaAPI) GetTx(hash string) (*Transaction, error) {
	tx, err := s.getTransactionDetail(hash)
	if err != nil {
		return nil, err
	}
	
	if tx != nil {
		return tx, nil
	}
	
	return nil, fmt.Errorf("transaction not found")
}

func (s *SolanaAPI) ValidateAddr(addr string) bool {
	// Solana 地址是 base58 编码，长度通常是 32-44 个字符
	return len(addr) >= 32 && len(addr) <= 44
}

type SolscanAPI struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

func NewSolscanAPI(apiKey string) *SolscanAPI {
	return &SolscanAPI{
		endpoint: "https://public-api.solscan.io",
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (sol *SolscanAPI) GetTxs(addr string, from int64) ([]Transaction, error) {
	// Solscan API for SPL token transfers
	url := fmt.Sprintf("%s/account/splTransfers?account=%s&limit=50", sol.endpoint, addr)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	
	if sol.apiKey != "" {
		req.Header.Set("token", sol.apiKey)
	}
	
	resp, err := sol.client.Do(req)
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
			Signature       string  `json:"signature"`
			BlockTime       int64   `json:"blockTime"`
			From            string  `json:"from"`
			To              string  `json:"to"`
			Amount          float64 `json:"amount"`
			Decimals        int     `json:"decimals"`
			TokenSymbol     string  `json:"symbol"`
			Status          string  `json:"status"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, transfer := range result.Data {
		if transfer.BlockTime < from || transfer.To != addr {
			continue
		}
		
		amount := decimal.NewFromFloat(transfer.Amount)
		
		txs = append(txs, Transaction{
			Hash:      transfer.Signature,
			From:      transfer.From,
			To:        transfer.To,
			Amount:    amount,
			Currency:  transfer.TokenSymbol,
			Timestamp: transfer.BlockTime,
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (sol *SolscanAPI) GetTx(hash string) (*Transaction, error) {
	url := fmt.Sprintf("%s/transaction/%s", sol.endpoint, hash)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	
	if sol.apiKey != "" {
		req.Header.Set("token", sol.apiKey)
	}
	
	resp, err := sol.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("transaction not found")
	}
	
	return &Transaction{Hash: hash, Status: "confirmed"}, nil
}

func (sol *SolscanAPI) ValidateAddr(addr string) bool {
	return len(addr) >= 32 && len(addr) <= 44
}