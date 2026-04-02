package model

import (
	"strings"
	"time"
)

type PaymentType string

const (
	PayTypeBlockchain PaymentType = "blockchain"
	PayTypeExchange   PaymentType = "exchange"
	PayTypeWallet     PaymentType = "wallet"
)

type Payment struct {
	ID        int64
	Type      PaymentType
	Name      string
	Chain     string
	Currency  string
	Address   string
	APIKey    string
	APISecret string
	Enabled   bool
	Config    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// IsBlockchain 是否为区块链支付
func (p *Payment) IsBlockchain() bool {
	return p.Type == PayTypeBlockchain
}

// DisplayName 显示名称
func (p *Payment) DisplayName() string {
	if strings.TrimSpace(p.Name) != "" {
		return strings.TrimSpace(p.Name)
	}
	if p.Type == PayTypeBlockchain {
		if p.Chain != "" && p.Currency != "" {
			return p.Chain + " (" + p.Currency + ")"
		}
		return p.Chain
	}
	if p.Type == PayTypeExchange {
		return "Exchange"
	}
	return "Wallet"
}
