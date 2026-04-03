package bot

import (
	"fmt"
	"os"
	"strings"

	cfgpkg "hashpay/internal/config"
	"hashpay/internal/service"
	"hashpay/internal/utils/log"

	tele "gopkg.in/telebot.v4"
)

// NewBot builds the Telegram bot adapter.
func NewBot(cfg *cfgpkg.Config, onVerify func(userID int64) error) (*Bot, error) {
	tb, err := tele.NewBot(tele.Settings{
		Token:  strings.TrimSpace(cfg.Bot.Token),
		Poller: &tele.LongPoller{Timeout: 10},
		OnError: func(err error, c tele.Context) {
			log.Error("bot error: %v", err)
		},
	})
	if err != nil {
		return nil, err
	}
	b := &Bot{
		bot:      tb,
		cfg:      cfg,
		onVerify: onVerify,
		orderMsg: map[string]tele.StoredMessage{},
	}
	b.syncAdmin(onVerify)
	b.routes()
	return b, nil
}

func (b *Bot) SetApp(app *service.App) {
	b.mu.Lock()
	b.app = app
	b.mu.Unlock()
}

func (b *Bot) Start() {
	log.Info("Telegram Bot 已启动: @%s", b.bot.Me.Username)
	b.bot.Start()
}

func (b *Bot) Stop() {
	b.bot.Stop()
}

func (b *Bot) routes() {
	b.bot.Handle("/start", b.handleStart)
	b.bot.Handle("/stats", b.handleStats)
	b.bot.Handle(tele.OnText, b.handleText)
	b.bot.Handle(tele.OnQuery, b.handleInlineQuery)
	b.bot.Handle(tele.OnInlineResult, b.handleInlineResult)
	b.bot.Handle(&tele.Btn{Unique: "route_pick"}, b.handleRoutePick)
}

func (b *Bot) sendText(to tele.Recipient, text string, markup *tele.ReplyMarkup) error {
	_, err := b.bot.Send(to, text, &tele.SendOptions{ReplyMarkup: markup})
	return err
}

func (b *Bot) isAdmin(userID int64) bool {
	adminID := b.currentAdmin()
	return adminID > 0 && userID == adminID
}

func (b *Bot) setupMode() bool {
	return b.currentAdmin() == 0 && strings.TrimSpace(b.pin) != ""
}

func (b *Bot) getApp() *service.App {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.app
}

func (b *Bot) syncAdmin(onVerify func(userID int64) error) {
	b.onVerify = onVerify
	if b.currentAdmin() > 0 {
		b.pin = ""
		return
	}
	if strings.TrimSpace(b.pin) == "" {
		b.pin = fmt.Sprintf("%04d", 1000+os.Getpid()%9000)
		log.Info("bot.admin 未配置，请向机器人发送 PIN 完成管理员绑定: %s", b.pin)
	}
}

func (b *Bot) currentAdmin() int64 {
	return b.cfg.Bot.Admin
}

func (b *Bot) currentPublicURL() string {
	return strings.TrimRight(strings.TrimSpace(b.cfg.Server.Public), "/")
}
