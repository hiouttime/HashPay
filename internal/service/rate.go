package service

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"sync"
	"time"

	"github.com/shopspring/decimal"
)

type Rate struct {
	From   string
	To     string
	Value  decimal.Decimal
	Time   time.Time
}

type RateSource interface {
	GetRate(from, to string) (decimal.Decimal, error)
}

type RateService struct {
	sources []RateSource
	cache   map[string]*Rate
	mu      sync.RWMutex
	ttl     time.Duration
}

func NewRateService() *RateService {
	return &RateService{
		sources: []RateSource{
			NewBinanceRate(),
			NewCoinGeckoRate(),
		},
		cache: make(map[string]*Rate),
		ttl:   5 * time.Minute,
	}
}

func (s *RateService) GetRate(from, to string) decimal.Decimal {
	key := fmt.Sprintf("%s_%s", from, to)
	
	s.mu.RLock()
	if rate, ok := s.cache[key]; ok {
		if time.Since(rate.Time) < s.ttl {
			s.mu.RUnlock()
			return rate.Value
		}
	}
	s.mu.RUnlock()
	
	rates := s.fetchRates(from, to)
	if len(rates) == 0 {
		return decimal.NewFromInt(1)
	}
	
	median := s.calcMedian(rates)
	
	s.mu.Lock()
	s.cache[key] = &Rate{
		From:  from,
		To:    to,
		Value: median,
		Time:  time.Now(),
	}
	s.mu.Unlock()
	
	return median
}

func (s *RateService) fetchRates(from, to string) []decimal.Decimal {
	var rates []decimal.Decimal
	var wg sync.WaitGroup
	var mu sync.Mutex
	
	for _, source := range s.sources {
		wg.Add(1)
		go func(src RateSource) {
			defer wg.Done()
			
			rate, err := src.GetRate(from, to)
			if err == nil {
				mu.Lock()
				rates = append(rates, rate)
				mu.Unlock()
			}
		}(source)
	}
	
	wg.Wait()
	return rates
}

func (s *RateService) calcMedian(rates []decimal.Decimal) decimal.Decimal {
	if len(rates) == 0 {
		return decimal.NewFromInt(1)
	}
	
	if len(rates) == 1 {
		return rates[0]
	}
	
	sum := decimal.Zero
	for _, rate := range rates {
		sum = sum.Add(rate)
	}
	
	return sum.Div(decimal.NewFromInt(int64(len(rates))))
}

type BinanceRate struct {
	client *http.Client
}

func NewBinanceRate() *BinanceRate {
	return &BinanceRate{
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (b *BinanceRate) GetRate(from, to string) (decimal.Decimal, error) {
	if from == "CNY" && to == "USDT" {
		return b.getCNYToUSDT()
	}
	
	symbol := fmt.Sprintf("%s%s", to, from)
	url := fmt.Sprintf("https://api.binance.com/api/v3/ticker/price?symbol=%s", symbol)
	
	resp, err := b.client.Get(url)
	if err != nil {
		return decimal.Zero, err
	}
	defer resp.Body.Close()
	
	var result struct {
		Price string `json:"price"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return decimal.Zero, err
	}
	
	price, err := decimal.NewFromString(result.Price)
	if err != nil {
		return decimal.Zero, err
	}
	
	return price, nil
}

func (b *BinanceRate) getCNYToUSDT() (decimal.Decimal, error) {
	url := "https://api.binance.com/api/v3/ticker/price?symbol=USDTCNY"
	
	resp, err := b.client.Get(url)
	if err != nil {
		return decimal.NewFromFloat(7.3), nil
	}
	defer resp.Body.Close()
	
	var result struct {
		Price string `json:"price"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return decimal.NewFromFloat(7.3), nil
	}
	
	price, _ := decimal.NewFromString(result.Price)
	if price.IsZero() {
		return decimal.NewFromFloat(7.3), nil
	}
	
	return price, nil
}

type CoinGeckoRate struct {
	client *http.Client
}

func NewCoinGeckoRate() *CoinGeckoRate {
	return &CoinGeckoRate{
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (c *CoinGeckoRate) GetRate(from, to string) (decimal.Decimal, error) {
	currencyMap := map[string]string{
		"USDT": "tether",
		"USDC": "usd-coin",
		"TRX":  "tron",
		"TON":  "the-open-network",
	}
	
	coinID, ok := currencyMap[to]
	if !ok {
		return decimal.Zero, fmt.Errorf("unsupported currency: %s", to)
	}
	
	vsCurrency := "usd"
	if from == "CNY" {
		vsCurrency = "cny"
	}
	
	url := fmt.Sprintf("https://api.coingecko.com/api/v3/simple/price?ids=%s&vs_currencies=%s",
		coinID, vsCurrency)
	
	resp, err := c.client.Get(url)
	if err != nil {
		return decimal.Zero, err
	}
	defer resp.Body.Close()
	
	body, _ := ioutil.ReadAll(resp.Body)
	
	var result map[string]map[string]float64
	if err := json.Unmarshal(body, &result); err != nil {
		return decimal.Zero, err
	}
	
	if price, ok := result[coinID][vsCurrency]; ok {
		return decimal.NewFromFloat(price), nil
	}
	
	return decimal.Zero, fmt.Errorf("price not found")
}