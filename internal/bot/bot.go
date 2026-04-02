package bot

import (
	"errors"
	"strings"
	"sync"
	"time"

	"hashpay/internal/pkg/log"
	"hashpay/internal/service"

	tele "gopkg.in/telebot.v4"
)

// Bot Telegram Bot 实例
type Bot struct {
	bot      *tele.Bot
	users    *service.UserService
	stats    *service.StatsService
	orders   *service.OrderService
	payments *service.PaymentService
	rates    *service.RateService
	config   *service.ConfigService
	adminID  int64

	orderMsgMu sync.RWMutex
	orderMsg   map[string]tele.StoredMessage

	helpTimerMu sync.Mutex
	helpTimers  map[string]*time.Timer

	helpStateMu sync.RWMutex
	helpStates  map[int64]helpState
}

type helpState struct {
	OrderID       string
	AwaitingPhoto bool
}

// Config Bot 配置
type Config struct {
	Token   string
	AdminID int64
}

// Services Bot 依赖的服务
type Services struct {
	Users    *service.UserService
	Stats    *service.StatsService
	Orders   *service.OrderService
	Payments *service.PaymentService
	Rates    *service.RateService
	Config   *service.ConfigService
}

// New 创建 Bot 实例
func New(cfg *Config, svc *Services) (*Bot, error) {
	b, err := tele.NewBot(tele.Settings{
		Token:     cfg.Token,
		Poller:    &tele.LongPoller{Timeout: 10 * time.Second},
		ParseMode: tele.ModeHTML,
		OnError: func(err error, c tele.Context) {
			if isBenignBotError(err) {
				return
			}
			if c != nil && c.Sender() != nil {
				log.Error("Bot 更新处理失败: uid=%d err=%v", c.Sender().ID, err)
				return
			}
			log.Error("Bot 运行错误: %v", err)
		},
	})
	if err != nil {
		return nil, err
	}

	bot := &Bot{
		bot:        b,
		users:      svc.Users,
		stats:      svc.Stats,
		orders:     svc.Orders,
		payments:   svc.Payments,
		rates:      svc.Rates,
		config:     svc.Config,
		adminID:    cfg.AdminID,
		orderMsg:   map[string]tele.StoredMessage{},
		helpTimers: map[string]*time.Timer{},
		helpStates: map[int64]helpState{},
	}

	bot.setupHandlers()

	return bot, nil
}

// Start 启动 Bot
func (b *Bot) Start() {
	log.Info("Telegram Bot 已启动: @%s", b.Username())
	log.Info("Inline 收款依赖 Telegram 选中回调，请在 @BotFather 设置 /setinlinefeedback 为 100%%")
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
	b.bot.Handle(tele.OnText, b.handleText)
	b.bot.Handle(tele.OnQuery, b.handleInlineQuery)
	b.bot.Handle(tele.OnInlineResult, b.handleInlineResult)
	b.bot.Handle(tele.OnPhoto, b.handlePhoto)
	b.bot.Handle(&tele.Btn{Unique: callbackPayCurrency}, b.handlePayCurrency)
	b.bot.Handle(&tele.Btn{Unique: callbackPayNetwork}, b.handlePayNetwork)
	b.bot.Handle(&tele.Btn{Unique: callbackPayCurrencies}, b.handlePayCurrencies)
	b.bot.Handle(&tele.Btn{Unique: callbackPayPending}, b.handlePayPending)
	b.bot.Handle(&tele.Btn{Unique: callbackHelpTopic}, b.handleHelpTopic)
	b.bot.Handle(&tele.Btn{Unique: callbackHelpNetwork}, b.handleHelpNetwork)
	b.bot.Handle(&tele.Btn{Unique: callbackHelpToken}, b.handleHelpToken)
	b.bot.Handle(&tele.Btn{Unique: callbackHelpAmount}, b.handleHelpAmount)
	b.bot.Handle(&tele.Btn{Unique: callbackHelpReview}, b.handleHelpReview)
}

func (b *Bot) isAdmin(userID int64) bool {
	return userID == b.adminID || b.users.IsAdmin(userID)
}

func isBenignBotError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, tele.ErrTrueResult) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "message is not modified")
}
