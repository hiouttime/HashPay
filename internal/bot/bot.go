package bot

import (
	"database/sql"
	"fmt"
	"time"

	"hashpay/internal/command"
	configcmd "hashpay/internal/command/config"
	"hashpay/internal/command/help"
	"hashpay/internal/command/orders"
	"hashpay/internal/command/start"
	"hashpay/internal/command/stats"
	"hashpay/internal/database"
	"hashpay/internal/ui"

	tele "gopkg.in/telebot.v4"
)

type Bot struct {
	bot *tele.Bot
	db  *database.DB
}

type Config struct {
	Token string
	Admin int64
}

func New(cfg *Config, db *sql.DB) (*Bot, error) {
	pref := tele.Settings{
		Token:  cfg.Token,
		Poller: &tele.LongPoller{Timeout: 10 * time.Second},
	}

	b, err := tele.NewBot(pref)
	if err != nil {
		return nil, fmt.Errorf("new bot: %w", err)
	}

	dbWrapper := &database.DB{}
	dbWrapper.DB = db
	bot := &Bot{
		bot: b,
		db:  dbWrapper,
	}

	bot.setupHandlers()

	return bot, nil
}

func (b *Bot) Start() {
	ui.Info("Bot 服务启动")
	b.bot.Start()
}

func (b *Bot) Stop() {
	b.bot.Stop()
	ui.Info("Bot 服务停止")
}

func (b *Bot) Username() string {
	if b.bot.Me != nil {
		return b.bot.Me.Username
	}
	return ""
}

func (b *Bot) setupHandlers() {
	deps := command.Dependencies{
		DB:         b.db,
		IsAdmin:    b.IsAdmin,
		Username:   b.Username,
		MiniAppURL: "",
	}

	handlers := []command.Handler{
		start.New(deps),
		help.New(deps),
		stats.New(deps),
		orders.New(deps),
		configcmd.New(deps),
	}

	for _, h := range handlers {
		b.bot.Handle(h.Command(), h.Handle)
	}

	b.bot.Handle(tele.OnQuery, b.handleInlineQuery)
	b.bot.Handle(tele.OnInlineResult, b.handleInlineResult)
	b.bot.Handle(tele.OnCallback, b.handleCallback)
	b.bot.Handle(tele.OnText, b.handleText)
}

func (b *Bot) IsAdmin(userID int64) bool {
	user, err := b.db.GetUser(userID)
	if err != nil {
		return false
	}
	return user.IsAdmin.Valid && user.IsAdmin.Int64 == 1
}

func (b *Bot) DB() *database.DB {
	return b.db
}

func (b *Bot) isSetup() bool {
	val, err := b.db.GetConfig("setup_completed")
	if err != nil {
		return false
	}
	return val == "true"
}
