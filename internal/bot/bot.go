package bot

import (
	"database/sql"
	"fmt"
	"hashpay/internal/database"
	"log"
	"math/rand"
	"sync"
	"time"

	tele "gopkg.in/telebot.v4"
)

type Bot struct {
	bot      *tele.Bot
	db       *database.DB
	handlers *Handlers
	mu       sync.RWMutex
	pins     map[int64]string
	config   *Config
}

type Config struct {
	Token   string
	AdminID int64
}

type Handlers struct {
	bot *Bot
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
		bot:      b,
		db:       dbWrapper,
		pins:     make(map[int64]string),
		config:   cfg,
	}
	
	bot.handlers = &Handlers{bot: bot}
	bot.setupHandlers()

	return bot, nil
}

func (b *Bot) Start() {
	log.Println("Bot started")
	b.bot.Start()
}

func (b *Bot) Stop() {
	b.bot.Stop()
	log.Println("Bot stopped")
}

func (b *Bot) Username() string {
	if b.bot.Me != nil {
		return b.bot.Me.Username
	}
	return ""
}

func (b *Bot) setupHandlers() {
	b.bot.Handle("/start", b.handlers.handleStart)
	b.bot.Handle("/help", b.handlers.handleHelp)
	b.bot.Handle("/stats", b.handlers.handleStats)
	b.bot.Handle("/orders", b.handlers.handleOrders)
	b.bot.Handle("/config", b.handlers.handleConfig)
	
	b.bot.Handle(tele.OnQuery, b.handlers.handleInlineQuery)
	b.bot.Handle(tele.OnInlineResult, b.handlers.handleInlineResult)
	b.bot.Handle(tele.OnCallback, b.handlers.handleCallback)
	b.bot.Handle(tele.OnText, b.handlers.handleText)
}

func (b *Bot) genPIN() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("%04d", rand.Intn(10000))
}

func (b *Bot) setPIN(userID int64, pin string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.pins[userID] = pin
}

func (b *Bot) checkPIN(userID int64, pin string) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	expectedPIN, exists := b.pins[userID]
	if !exists {
		return false
	}
	return expectedPIN == pin
}

func (b *Bot) removePIN(userID int64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.pins, userID)
}

func (b *Bot) isAdmin(userID int64) bool {
	user, err := b.db.GetUser(userID)
	if err != nil {
		return false
	}
	return user.IsAdmin.Valid && user.IsAdmin.Int64 == 1
}

func (b *Bot) isSetup() bool {
	val, err := b.db.GetConfig("setup_completed")
	if err != nil {
		return false
	}
	return val == "true"
}