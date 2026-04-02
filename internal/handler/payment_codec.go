package handler

import (
	"encoding/json"
	"strings"
)

type paymentConfig struct {
	Coins []string `json:"coins"`
}

func normalizeCoins(coins []string) []string {
	if len(coins) == 0 {
		return nil
	}

	seen := map[string]struct{}{}
	result := make([]string, 0, len(coins))
	for _, coin := range coins {
		coin = strings.ToUpper(strings.TrimSpace(coin))
		if coin == "" {
			continue
		}
		if _, ok := seen[coin]; ok {
			continue
		}
		seen[coin] = struct{}{}
		result = append(result, coin)
	}
	return result
}

func encodePaymentConfig(coins []string) string {
	cfg := paymentConfig{Coins: normalizeCoins(coins)}
	buf, err := json.Marshal(cfg)
	if err != nil {
		return ""
	}
	return string(buf)
}

func decodePaymentCoins(config string, fallbackCurrency string) []string {
	if strings.TrimSpace(config) != "" {
		var cfg paymentConfig
		if err := json.Unmarshal([]byte(config), &cfg); err == nil {
			coins := normalizeCoins(cfg.Coins)
			if len(coins) > 0 {
				return coins
			}
		}
	}

	fallbackCurrency = strings.TrimSpace(fallbackCurrency)
	if fallbackCurrency == "" {
		return nil
	}
	return []string{strings.ToUpper(fallbackCurrency)}
}

func primaryCoin(coins []string) string {
	normalized := normalizeCoins(coins)
	if len(normalized) == 0 {
		return ""
	}
	return normalized[0]
}
