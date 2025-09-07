package payment

import (
	"bytes"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type HuioneAPI struct {
	merchantID string
	apiKey     string
	apiSecret  string
	client     *http.Client
	baseURL    string
}

func NewHuioneAPI(merchantID, apiKey, apiSecret string) *HuioneAPI {
	return &HuioneAPI{
		merchantID: merchantID,
		apiKey:     apiKey,
		apiSecret:  apiSecret,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: "https://api.huione.com",
	}
}

func (h *HuioneAPI) CreatePay(amount decimal.Decimal, currency string) (string, error) {
	orderID := h.genOrderID()
	timestamp := time.Now().Unix()
	
	params := map[string]interface{}{
		"merchant_id": h.merchantID,
		"order_id":    orderID,
		"amount":      amount.String(),
		"currency":    currency,
		"timestamp":   timestamp,
		"notify_url":  "https://example.com/notify",
	}
	
	params["sign"] = h.sign(params)
	
	jsonData, _ := json.Marshal(params)
	
	req, err := http.NewRequest("POST", h.baseURL+"/v1/payment/create", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", h.apiKey)
	
	resp, err := h.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			PayURL  string `json:"pay_url"`
			OrderID string `json:"order_id"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	
	if result.Code != 0 {
		return "", fmt.Errorf("create payment failed: %s", result.Msg)
	}
	
	return result.Data.PayURL, nil
}

func (h *HuioneAPI) CheckPay(orderID string) (bool, error) {
	timestamp := time.Now().Unix()
	
	params := map[string]interface{}{
		"merchant_id": h.merchantID,
		"order_id":    orderID,
		"timestamp":   timestamp,
	}
	
	params["sign"] = h.sign(params)
	
	jsonData, _ := json.Marshal(params)
	
	req, err := http.NewRequest("POST", h.baseURL+"/v1/payment/query", bytes.NewBuffer(jsonData))
	if err != nil {
		return false, err
	}
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", h.apiKey)
	
	resp, err := h.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return false, err
	}
	
	var result struct {
		Code int    `json:"code"`
		Data struct {
			Status int `json:"status"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return false, err
	}
	
	return result.Data.Status == 1, nil
}

func (h *HuioneAPI) sign(params map[string]interface{}) string {
	var keys []string
	for k := range params {
		if k != "sign" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	
	var values []string
	for _, k := range keys {
		values = append(values, fmt.Sprintf("%s=%v", k, params[k]))
	}
	
	str := strings.Join(values, "&") + "&key=" + h.apiSecret
	
	hash := md5.Sum([]byte(str))
	return fmt.Sprintf("%x", hash)
}

func (h *HuioneAPI) genOrderID() string {
	return fmt.Sprintf("HU%d%d", time.Now().Unix(), time.Now().Nanosecond()/1000000)
}

type OKPayAPI struct {
	merchantID string
	apiKey     string
	apiSecret  string
	client     *http.Client
	baseURL    string
}

func NewOKPayAPI(merchantID, apiKey, apiSecret string) *OKPayAPI {
	return &OKPayAPI{
		merchantID: merchantID,
		apiKey:     apiKey,
		apiSecret:  apiSecret,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: "https://api.okpay.com",
	}
}

func (o *OKPayAPI) CreatePay(amount decimal.Decimal, currency string) (string, error) {
	orderID := o.genOrderID()
	
	params := map[string]interface{}{
		"merchant_id":  o.merchantID,
		"out_trade_no": orderID,
		"total_amount": amount.String(),
		"currency":     currency,
		"subject":      "Payment",
		"notify_url":   "https://example.com/notify",
		"return_url":   "https://example.com/return",
	}
	
	params["sign"] = o.sign(params)
	
	jsonData, _ := json.Marshal(params)
	
	req, err := http.NewRequest("POST", o.baseURL+"/api/v1/pay/create", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Content-Type", "application/json")
	
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
		Code    string `json:"code"`
		Message string `json:"message"`
		Data    struct {
			PayURL string `json:"pay_url"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	
	if result.Code != "SUCCESS" {
		return "", fmt.Errorf("create payment failed: %s", result.Message)
	}
	
	return result.Data.PayURL, nil
}

func (o *OKPayAPI) CheckPay(orderID string) (bool, error) {
	params := map[string]interface{}{
		"merchant_id":  o.merchantID,
		"out_trade_no": orderID,
	}
	
	params["sign"] = o.sign(params)
	
	jsonData, _ := json.Marshal(params)
	
	req, err := http.NewRequest("POST", o.baseURL+"/api/v1/pay/query", bytes.NewBuffer(jsonData))
	if err != nil {
		return false, err
	}
	
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := o.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return false, err
	}
	
	var result struct {
		Code string `json:"code"`
		Data struct {
			TradeStatus string `json:"trade_status"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return false, err
	}
	
	return result.Data.TradeStatus == "SUCCESS", nil
}

func (o *OKPayAPI) sign(params map[string]interface{}) string {
	var keys []string
	for k := range params {
		if k != "sign" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	
	var values []string
	for _, k := range keys {
		values = append(values, fmt.Sprintf("%s=%v", k, params[k]))
	}
	
	str := strings.Join(values, "&") + "&key=" + o.apiSecret
	
	hash := md5.Sum([]byte(str))
	return strings.ToUpper(fmt.Sprintf("%x", hash))
}

func (o *OKPayAPI) genOrderID() string {
	return fmt.Sprintf("OK%d%d", time.Now().Unix(), time.Now().Nanosecond()/1000000)
}