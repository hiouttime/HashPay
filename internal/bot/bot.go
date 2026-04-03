package bot

import (
	"fmt"
	"os"
	"strings"
	"sync"

	cfgpkg "hashpay/internal/config"
	"hashpay/internal/service"
	"hashpay/internal/utils/log"

	tele "gopkg.in/telebot.v4"
)

type Bot struct {
	bot *tele.Bot
	cfg *cfgpkg.Config
	pin string

	mu       sync.RWMutex
	app      func() *service.App
	orderMsg map[string]tele.StoredMessage
	setAdmin func(userID int64) error
	adminID  func() int64
}

// NewBot builds the Telegram bot adapter.
func NewBot(cfg *cfgpkg.Config, setAdmin func(userID int64) error, adminID func() int64, app func() *service.App) (*Bot, error) {
	tb, err := tele.NewBot(tele.Settings{
		Token:  cfg.Bot.Token,
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
		app:      app,
		setAdmin: setAdmin,
		adminID:  adminID,
		orderMsg: map[string]tele.StoredMessage{},
	}

	if b.admin() <= 0 {
		b.pin = fmt.Sprintf("%04d", 1000+os.Getpid()%9000)
		log.Warn("接下来，请发送 %s 到机器人完成管理员绑定。", b.pin)
	}
	b.routes()
	return b, nil
}

func (b *Bot) Start() {
	log.Success("Telegram Bot 已启动: @%s", b.bot.Me.Username)
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
	b.bot.Handle(&tele.Btn{Unique: "pay"}, b.handleRoutePick)
}

func (b *Bot) sendText(to tele.Recipient, text string, markup *tele.ReplyMarkup) error {
	_, err := b.bot.Send(to, text, &tele.SendOptions{ReplyMarkup: markup})
	return err
}

func (b *Bot) adminMarkup() *tele.ReplyMarkup {
	url := b.getPublicURL()
	if url == "" {
		return nil
	}
	keyboard := &tele.ReplyMarkup{}
	keyboard.Inline(keyboard.Row(
		keyboard.WebApp("🚀 打开管理后台", &tele.WebApp{URL: url + "/app"}),
	))
	return keyboard
}

func (b *Bot) isAdmin(userID int64) bool {
	adminID := b.admin()
	return adminID > 0 && userID == adminID
}

func (b *Bot) getApp() *service.App {
	if b.app == nil {
		return nil
	}
	return b.app()
}

func (b *Bot) admin() int64 {
	if b.adminID == nil {
		return 0
	}
	return b.adminID()
}

func (b *Bot) getPublicURL() string {
	if b.cfg == nil {
		return ""
	}
	return strings.TrimRight(strings.TrimSpace(b.cfg.Server.Public), "/")
}

func senderText(sender *tele.User) string {
	if sender == nil {
		return "user=unknown"
	}
	if username := strings.TrimSpace(sender.Username); username != "" {
		return fmt.Sprintf("user=%d @%s", sender.ID, username)
	}
	return fmt.Sprintf("user=%d", sender.ID)
}
