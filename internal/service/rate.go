package service

import (
	"hashpay/internal/repository"
	"strings"

	"github.com/shopspring/decimal"
)

type RateService struct {
	config *repository.ConfigRepo
}

func NewRateService(config *repository.ConfigRepo) *RateService {
	return &RateService{config: config}
}

// Convert 货币转换
func (s *RateService) Convert(amount float64, from, to string) decimal.Decimal {
	rate := s.GetRate(from, to)
	if rate.IsZero() {
		return decimal.NewFromFloat(amount).RoundCeil(3)
	}
	return decimal.NewFromFloat(amount).Div(rate).RoundCeil(3)
}

// GetRate 获取汇率
func (s *RateService) GetRate(from, to string) decimal.Decimal {
	// TODO: 实现实时汇率获取
	// 目前使用固定汇率
	rates := map[string]map[string]float64{
		"CNY": {
			"USDT": 7.2,
			"USDC": 7.2,
			"TRX":  0.5,
			"TON":  45.0,
			"BNB":  4500.0,
			"ETH":  25000.0,
		},
		"USD": {
			"USDT": 1.0,
			"USDC": 1.0,
			"TRX":  0.07,
			"TON":  6.5,
			"BNB":  650.0,
			"ETH":  3500.0,
		},
	}

	from = strings.ToUpper(strings.TrimSpace(from))
	to = strings.ToUpper(strings.TrimSpace(to))
	if rateMap, ok := rates[from]; ok {
		if rate, ok := rateMap[to]; ok {
			return decimal.NewFromFloat(rate)
		}
	}

	return decimal.NewFromInt(1)
}

// GetAdjustment 获取汇率微调值
func (s *RateService) GetAdjustment() decimal.Decimal {
	val, _ := s.config.Get("rate_adjust")
	if val == "" {
		return decimal.Zero
	}
	adj, _ := decimal.NewFromString(val)
	return adj
}
