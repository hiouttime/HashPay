package bootstrap

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	tgbot "hashpay/internal/bot"
	"hashpay/internal/config"
	httpapi "hashpay/internal/http"
	"hashpay/internal/jobs"
	"hashpay/internal/payments"
	"hashpay/internal/pkg/log"
	"hashpay/internal/store"
	"hashpay/internal/usecase"

	"github.com/gofiber/fiber/v3"
)

type setupState struct {
	mu      sync.RWMutex
	cfg     *config.Config
	server  *httpapi.Server
	app     *usecase.App
	db      *store.Store
	jobs    *jobs.Runner
	bot     *tgbot.Runtime
	pin     string
	running bool
}

func Run() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	state := &setupState{cfg: cfg}
	server := httpapi.New(cfg, state)
	state.server = server

	if ready(cfg) {
		if err := state.enableRuntime(); err != nil {
			log.Warn("运行时加载失败: %v", err)
		}
	} else if strings.TrimSpace(cfg.Bot.Token) != "" {
		state.ensureSetupPIN()
		_ = state.startBot()
	}

	log.Info("HashPay 运行在 %s", cfg.BindAddr())
	return server.Start(cfg.BindAddr())
}

func (s *setupState) Status() fiber.Map {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.running {
		return fiber.Map{"status": "running"}
	}
	return fiber.Map{
		"status":       "init",
		"has_bot":      strings.TrimSpace(s.cfg.Bot.Token) != "",
		"needs_admin":  s.cfg.Bot.Admin == 0,
		"setup_pin":    s.pin,
		"public_url":   s.cfg.Server.Public,
		"bind_address": s.cfg.BindAddr(),
	}
}

func (s *setupState) Submit(c fiber.Ctx) error {
	var req struct {
		PublicURL string `json:"public_url"`
		BotToken  string `json:"bot_token"`
		Debug     bool   `json:"debug"`
		Database  struct {
			Type   string `json:"type"`
			SQLite struct {
				Path string `json:"path"`
			} `json:"sqlite"`
		} `json:"database"`
		System map[string]string `json:"system"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "请求格式错误")
	}

	s.mu.Lock()
	s.cfg.Server.Public = strings.TrimRight(strings.TrimSpace(req.PublicURL), "/")
	s.cfg.Bot.Token = strings.TrimSpace(req.BotToken)
	s.cfg.Debug = req.Debug
	if strings.TrimSpace(req.Database.Type) != "" {
		s.cfg.Database.Type = strings.TrimSpace(req.Database.Type)
	}
	if strings.TrimSpace(req.Database.SQLite.Path) != "" {
		s.cfg.Database.SQLite.Path = req.Database.SQLite.Path
	}
	if s.cfg.Database.Type == "" {
		s.cfg.Database.Type = "sqlite"
	}
	if s.cfg.Database.SQLite.Path == "" {
		s.cfg.Database.SQLite.Path = "./data/hashpay.db"
	}
	cfgCopy := *s.cfg
	s.mu.Unlock()

	if err := ensureDataPath(cfgCopy.Database.SQLite.Path); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "创建数据目录失败")
	}
	if err := config.Save(config.ConfigPath, &cfgCopy); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "保存配置失败")
	}

	db, err := store.Open(&cfgCopy)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "数据库初始化失败")
	}
	if err := db.Migrate(); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "数据库迁移失败")
	}
	st := store.New(db)
	if err := st.SetConfigs(req.System); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "系统配置写入失败")
	}

	s.mu.Lock()
	if s.db != nil {
		_ = s.db.Close()
	}
	s.db = st
	s.mu.Unlock()

	if s.cfg.Bot.Admin == 0 {
		s.ensureSetupPIN()
		if err := s.startBot(); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Bot 启动失败")
		}
		return c.JSON(fiber.Map{
			"status":    "pending_admin",
			"ready":     false,
			"setup_pin": s.pin,
			"message":   "请向机器人发送验证码完成管理员绑定",
		})
	}
	if err := s.enableRuntime(); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "业务服务启动失败")
	}
	return c.JSON(fiber.Map{"status": "ok", "ready": true})
}

func (s *setupState) ensureSetupPIN() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pin != "" {
		return
	}
	s.pin = fmt.Sprintf("%04d", 1000+os.Getpid()%9000)
}

func (s *setupState) verifyAdmin(userID int64, username string) error {
	s.mu.Lock()
	s.cfg.Bot.Admin = userID
	cfgCopy := *s.cfg
	s.mu.Unlock()
	if err := config.Save(config.ConfigPath, &cfgCopy); err != nil {
		return err
	}
	if s.db == nil {
		return fmt.Errorf("store not ready")
	}
	if err := s.db.UpsertAdmin(userID, username); err != nil {
		return err
	}
	return s.enableRuntime()
}

func (s *setupState) enableRuntime() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		db, err := store.Open(s.cfg)
		if err != nil {
			return err
		}
		if err := db.Migrate(); err != nil {
			return err
		}
		s.db = store.New(db)
	}
	if s.cfg.Bot.Admin > 0 {
		_ = s.db.UpsertAdmin(s.cfg.Bot.Admin, "")
	}
	app := usecase.New(s.db, payments.DefaultRegistry(), s.cfg)
	s.app = app
	s.server.SetRuntime(&httpapi.Runtime{App: app})
	if s.bot != nil {
		s.bot.SetApp(app)
	}
	if s.jobs != nil {
		s.jobs.Stop()
	}
	s.jobs = jobs.New(s.db, app, s.cfg, s.bot)
	s.jobs.Start()
	s.running = true
	return s.startBot()
}

func (s *setupState) startBot() error {
	if strings.TrimSpace(s.cfg.Bot.Token) == "" {
		return nil
	}
	if s.bot != nil {
		s.bot.Stop()
	}
	bot, err := tgbot.NewRuntime(&tgbot.RuntimeConfig{
		Token:     s.cfg.Bot.Token,
		PublicURL: s.cfg.Server.Public,
		AdminID:   s.cfg.Bot.Admin,
		PIN:       s.pin,
		OnVerify:  s.verifyAdmin,
	})
	if err != nil {
		return err
	}
	bot.SetApp(s.app)
	s.bot = bot
	go bot.Start()
	return nil
}

func ready(cfg *config.Config) bool {
	return strings.TrimSpace(cfg.Bot.Token) != "" && cfg.Bot.Admin > 0
}

func loadConfig() (*config.Config, error) {
	if !config.Exists(config.ConfigPath) {
		return &config.Config{
			Server: config.ServerConfig{Bind: ":8181"},
			Database: config.DatabaseConfig{
				Type: "sqlite",
				SQLite: config.SQLiteConfig{
					Path: "./data/hashpay.db",
				},
			},
		}, nil
	}
	return config.Load(config.ConfigPath)
}

func ensureDataPath(path string) error {
	dir := filepath.Dir(path)
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0755)
}

func parseInt(raw string) int64 {
	v, _ := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	return v
}
