package payment

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type EthereumAPI struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

func NewEthereumAPI(endpoint, apiKey string) *EthereumAPI {
	return &EthereumAPI{
		endpoint: endpoint,
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (e *EthereumAPI) GetTxs(addr string, from int64) ([]Transaction, error) {
	// ERC20 代币转账事件
	url := fmt.Sprintf("%s/api?module=account&action=tokentx&address=%s&startblock=%d&sort=desc&apikey=%s",
		e.endpoint, addr, from, e.apiKey)
	
	resp, err := e.client.Get(url)
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
			Hash           string `json:"hash"`
			From           string `json:"from"`
			To             string `json:"to"`
			Value          string `json:"value"`
			TokenSymbol    string `json:"tokenSymbol"`
			TokenDecimal   string `json:"tokenDecimal"`
			TimeStamp      string `json:"timeStamp"`
			BlockNumber    string `json:"blockNumber"`
			Confirmations  string `json:"confirmations"`
		} `json:"result"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, tx := range result.Result {
		if !strings.EqualFold(tx.To, addr) {
			continue
		}
		
		amount, _ := decimal.NewFromString(tx.Value)
		decimals, _ := decimal.NewFromString(tx.TokenDecimal)
		divisor := decimal.NewFromInt(10).Pow(decimals)
		amount = amount.Div(divisor)
		
		timestamp, _ := decimal.NewFromString(tx.TimeStamp)
		blockNum, _ := decimal.NewFromString(tx.BlockNumber)
		
		txs = append(txs, Transaction{
			Hash:      tx.Hash,
			From:      tx.From,
			To:        tx.To,
			Amount:    amount,
			Currency:  tx.TokenSymbol,
			BlockNum:  blockNum.IntPart(),
			Timestamp: timestamp.IntPart(),
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (e *EthereumAPI) GetTx(hash string) (*Transaction, error) {
	url := fmt.Sprintf("%s/api?module=transaction&action=gettxreceiptstatus&txhash=%s&apikey=%s",
		e.endpoint, hash, e.apiKey)
	
	resp, err := e.client.Get(url)
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

func (e *EthereumAPI) ValidateAddr(addr string) bool {
	return len(addr) == 42 && strings.HasPrefix(addr, "0x")
}

type PolygonAPI struct {
	endpoint string
	apiKey   string
	client   *http.Client
}

func NewPolygonAPI(endpoint, apiKey string) *PolygonAPI {
	return &PolygonAPI{
		endpoint: endpoint,
		apiKey:   apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (p *PolygonAPI) GetTxs(addr string, from int64) ([]Transaction, error) {
	// Polygon 使用与 Ethereum 相同的 API 格式
	url := fmt.Sprintf("%s/api?module=account&action=tokentx&address=%s&startblock=%d&sort=desc&apikey=%s",
		p.endpoint, addr, from, p.apiKey)
	
	resp, err := p.client.Get(url)
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
		Result  []struct {
			Hash         string `json:"hash"`
			From         string `json:"from"`
			To           string `json:"to"`
			Value        string `json:"value"`
			TokenSymbol  string `json:"tokenSymbol"`
			TokenDecimal string `json:"tokenDecimal"`
			TimeStamp    string `json:"timeStamp"`
			BlockNumber  string `json:"blockNumber"`
		} `json:"result"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, tx := range result.Result {
		if !strings.EqualFold(tx.To, addr) {
			continue
		}
		
		amount, _ := decimal.NewFromString(tx.Value)
		decimals, _ := decimal.NewFromString(tx.TokenDecimal)
		divisor := decimal.NewFromInt(10).Pow(decimals)
		amount = amount.Div(divisor)
		
		timestamp, _ := decimal.NewFromString(tx.TimeStamp)
		blockNum, _ := decimal.NewFromString(tx.BlockNumber)
		
		txs = append(txs, Transaction{
			Hash:      tx.Hash,
			From:      tx.From,
			To:        tx.To,
			Amount:    amount,
			Currency:  tx.TokenSymbol,
			BlockNum:  blockNum.IntPart(),
			Timestamp: timestamp.IntPart(),
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (p *PolygonAPI) GetTx(hash string) (*Transaction, error) {
	url := fmt.Sprintf("%s/api?module=transaction&action=gettxreceiptstatus&txhash=%s&apikey=%s",
		p.endpoint, hash, p.apiKey)
	
	resp, err := p.client.Get(url)
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

func (p *PolygonAPI) ValidateAddr(addr string) bool {
	return len(addr) == 42 && strings.HasPrefix(addr, "0x")
}