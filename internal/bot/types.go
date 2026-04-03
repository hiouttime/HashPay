package bot

import (
	"sync"

	cfgpkg "hashpay/internal/config"
	"hashpay/internal/service"

	tele "gopkg.in/telebot.v4"
)

// Bot coordinates Telegram handlers with runtime app state.
type Bot struct {
	bot      *tele.Bot
	cfg      *cfgpkg.Config
	pin      string
	onVerify func(userID int64) error

	mu       sync.RWMutex
	app      *service.App
	orderMsg map[string]tele.StoredMessage
}
