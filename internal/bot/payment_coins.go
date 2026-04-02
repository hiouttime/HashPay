package bot

import (
	"encoding/json"
	"strings"

	"hashpay/internal/model"
)

type paymentCoinConfig struct {
	Coins []string `json:"coins"`
}

func normalizeCoinList(coins []string) []string {
	if len(coins) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	result := make([]string, 0, len(coins))
	for _, coin := range coins {
		value := normalizeCurrency(coin)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func paymentCoins(payment model.Payment) []string {
	cfg := strings.TrimSpace(payment.Config)
	if cfg != "" {
		var parsed paymentCoinConfig
		if err := json.Unmarshal([]byte(cfg), &parsed); err == nil {
			coins := normalizeCoinList(parsed.Coins)
			if len(coins) > 0 {
				return coins
			}
		}
	}
	currency := normalizeCurrency(payment.Currency)
	if currency == "" {
		return nil
	}
	return []string{currency}
}

func paymentSupportsCurrency(payment model.Payment, currency string) bool {
	target := normalizeCurrency(currency)
	if target == "" {
		return false
	}
	for _, coin := range paymentCoins(payment) {
		if coin == target {
			return true
		}
	}
	return false
}
