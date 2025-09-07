package payment

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type OKXApi struct {
	apiKey     string
	secretKey  string
	passphrase string
	client     *http.Client
	baseURL    string
}

func NewOKXApi(apiKey, secretKey, passphrase string) *OKXApi {
	return &OKXApi{
		apiKey:     apiKey,
		secretKey:  secretKey,
		passphrase: passphrase,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: "https://www.okx.com",
	}
}

func (o *OKXApi) GetDeposits(currency string, from int64) ([]Transaction, error) {
	path := "/api/v5/asset/deposit-history"
	params := fmt.Sprintf("?ccy=%s&after=%d&limit=50", currency, from*1000)
	
	req, err := o.newRequest("GET", path+params, nil)
	if err != nil {
		return nil, err
	}
	
	resp, err := o.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var result struct {
		Code string `json:"code"`
		Msg  string `json:"msg"`
		Data []struct {
			Ccy     string `json:"ccy"`
			Chain   string `json:"chain"`
			Amt     string `json:"amt"`
			From    string `json:"from"`
			To      string `json:"to"`
			TxId    string `json:"txId"`
			Ts      string `json:"ts"`
			State   string `json:"state"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	
	if result.Code != "0" {
		return nil, fmt.Errorf("OKX API error: %s", result.Msg)
	}
	
	var txs []Transaction
	for _, deposit := range result.Data {
		if deposit.State != "2" {
			continue
		}
		
		amount, _ := decimal.NewFromString(deposit.Amt)
		timestamp, _ := decimal.NewFromString(deposit.Ts)
		
		txs = append(txs, Transaction{
			Hash:      deposit.TxId,
			From:      deposit.From,
			To:        deposit.To,
			Amount:    amount,
			Currency:  deposit.Ccy,
			Timestamp: timestamp.IntPart() / 1000,
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (o *OKXApi) GetBalance(currency string) (decimal.Decimal, error) {
	path := "/api/v5/asset/balances"
	params := fmt.Sprintf("?ccy=%s", currency)
	
	req, err := o.newRequest("GET", path+params, nil)
	if err != nil {
		return decimal.Zero, err
	}
	
	resp, err := o.client.Do(req)
	if err != nil {
		return decimal.Zero, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return decimal.Zero, err
	}
	
	var result struct {
		Code string `json:"code"`
		Data []struct {
			Ccy       string `json:"ccy"`
			Bal       string `json:"bal"`
			AvailBal  string `json:"availBal"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return decimal.Zero, err
	}
	
	if result.Code != "0" {
		return decimal.Zero, fmt.Errorf("OKX API error")
	}
	
	if len(result.Data) > 0 {
		bal, _ := decimal.NewFromString(result.Data[0].AvailBal)
		return bal, nil
	}
	
	return decimal.Zero, nil
}

func (o *OKXApi) GetDepositAddress(currency, chain string) (string, error) {
	path := "/api/v5/asset/deposit-address"
	params := fmt.Sprintf("?ccy=%s", currency)
	
	req, err := o.newRequest("GET", path+params, nil)
	if err != nil {
		return "", err
	}
	
	resp, err := o.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	
	var result struct {
		Code string `json:"code"`
		Data []struct {
			Chain string `json:"chain"`
			Addr  string `json:"addr"`
			Tag   string `json:"tag"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	
	for _, addr := range result.Data {
		if strings.Contains(strings.ToUpper(addr.Chain), strings.ToUpper(chain)) {
			return addr.Addr, nil
		}
	}
	
	return "", fmt.Errorf("address not found for chain %s", chain)
}

func (o *OKXApi) newRequest(method, path string, body []byte) (*http.Request, error) {
	url := o.baseURL + path
	
	req, err := http.NewRequest(method, url, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	
	timestamp := time.Now().UTC().Format("2006-01-02T15:04:05.999Z")
	message := timestamp + method + path
	if len(body) > 0 {
		message += string(body)
	}
	
	signature := o.sign(message)
	
	req.Header.Set("OK-ACCESS-KEY", o.apiKey)
	req.Header.Set("OK-ACCESS-SIGN", signature)
	req.Header.Set("OK-ACCESS-TIMESTAMP", timestamp)
	req.Header.Set("OK-ACCESS-PASSPHRASE", o.passphrase)
	req.Header.Set("Content-Type", "application/json")
	
	return req, nil
}

func (o *OKXApi) sign(message string) string {
	h := hmac.New(sha256.New, []byte(o.secretKey))
	h.Write([]byte(message))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

type BinanceAPI struct {
	apiKey    string
	secretKey string
	client    *http.Client
	baseURL   string
}

func NewBinanceAPI(apiKey, secretKey string) *BinanceAPI {
	return &BinanceAPI{
		apiKey:    apiKey,
		secretKey: secretKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: "https://api.binance.com",
	}
}

func (b *BinanceAPI) GetDeposits(currency string, from int64) ([]Transaction, error) {
	path := "/sapi/v1/capital/deposit/hisrec"
	timestamp := time.Now().UnixMilli()
	
	params := fmt.Sprintf("coin=%s&startTime=%d&timestamp=%d", 
		currency, from*1000, timestamp)
	
	signature := b.sign(params)
	params += "&signature=" + signature
	
	req, err := http.NewRequest("GET", b.baseURL+path+"?"+params, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("X-MBX-APIKEY", b.apiKey)
	
	resp, err := b.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	var deposits []struct {
		Amount     string `json:"amount"`
		Coin       string `json:"coin"`
		Network    string `json:"network"`
		Status     int    `json:"status"`
		Address    string `json:"address"`
		TxId       string `json:"txId"`
		InsertTime int64  `json:"insertTime"`
	}
	
	if err := json.Unmarshal(body, &deposits); err != nil {
		return nil, err
	}
	
	var txs []Transaction
	for _, dep := range deposits {
		if dep.Status != 1 {
			continue
		}
		
		amount, _ := decimal.NewFromString(dep.Amount)
		
		txs = append(txs, Transaction{
			Hash:      dep.TxId,
			To:        dep.Address,
			Amount:    amount,
			Currency:  dep.Coin,
			Timestamp: dep.InsertTime / 1000,
			Status:    "confirmed",
		})
	}
	
	return txs, nil
}

func (b *BinanceAPI) GetBalance(currency string) (decimal.Decimal, error) {
	path := "/api/v3/account"
	timestamp := time.Now().UnixMilli()
	
	params := fmt.Sprintf("timestamp=%d", timestamp)
	signature := b.sign(params)
	params += "&signature=" + signature
	
	req, err := http.NewRequest("GET", b.baseURL+path+"?"+params, nil)
	if err != nil {
		return decimal.Zero, err
	}
	
	req.Header.Set("X-MBX-APIKEY", b.apiKey)
	
	resp, err := b.client.Do(req)
	if err != nil {
		return decimal.Zero, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return decimal.Zero, err
	}
	
	var account struct {
		Balances []struct {
			Asset  string `json:"asset"`
			Free   string `json:"free"`
			Locked string `json:"locked"`
		} `json:"balances"`
	}
	
	if err := json.Unmarshal(body, &account); err != nil {
		return decimal.Zero, err
	}
	
	for _, bal := range account.Balances {
		if bal.Asset == currency {
			free, _ := decimal.NewFromString(bal.Free)
			return free, nil
		}
	}
	
	return decimal.Zero, nil
}

func (b *BinanceAPI) sign(params string) string {
	h := hmac.New(sha256.New, []byte(b.secretKey))
	h.Write([]byte(params))
	return fmt.Sprintf("%x", h.Sum(nil))
}