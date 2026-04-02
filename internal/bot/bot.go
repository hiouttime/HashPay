package bot

import (
	"time"

	"hashpay/internal/pkg/log"
	"hashpay/internal/service"

	tele "gopkg.in/telebot.v4"
)

// Bot Telegram Bot 实例
type Bot struct {
	bot     *tele.Bot
	users   *service.UserService
	stats   *service.StatsService
	adminID int64
}

// Config Bot 配置
type Config struct {
	Token   string
	AdminID int64
}

// Services Bot 依赖的服务
type Services struct {
	Users *service.UserService
	Stats *service.StatsService
}

// New 创建 Bot 实例
func New(cfg *Config, svc *Services) (*Bot, error) {
	b, err := tele.NewBot(tele.Settings{
		Token:  cfg.Token,
		Poller: &tele.LongPoller{Timeout: 10 * time.Second},
	})
	if err != nil {
		return nil, err
	}

	bot := &Bot{
		bot:     b,
		users:   svc.Users,
		stats:   svc.Stats,
		adminID: cfg.AdminID,
	}

	bot.setupHandlers()

	return bot, nil
}

// Start 启动 Bot
func (b *Bot) Start() {
	log.Info("Telegram Bot 已启动: @%s", b.Username())
	b.bot.Start()
}

// Stop 停止 Bot
func (b *Bot) Stop() {
	b.bot.Stop()
	log.Info("Telegram Bot 已停止")
}

// Username 返回 Bot 用户名
func (b *Bot) Username() string {
	if b.bot.Me != nil {
		return b.bot.Me.Username
	}
	return ""
}

// SendNotification 发送通知给管理员
func (b *Bot) SendNotification(message string) error {
	_, err := b.bot.Send(&tele.User{ID: b.adminID}, message)
	return err
}

func (b *Bot) setupHandlers() {
	b.bot.Handle("/start", b.handleStart)
	b.bot.Handle("/help", b.handleHelp)
	b.bot.Handle("/stats", b.handleStats)
}

func (b *Bot) isAdmin(userID int64) bool {
	return userID == b.adminID || b.users.IsAdmin(userID)
}
