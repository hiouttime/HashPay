package app

import (
	"os/exec"
	"strings"

	tgbot "hashpay/internal/bot"
	config "hashpay/internal/config"
	httpapi "hashpay/internal/http"
	"hashpay/internal/jobs"
	"hashpay/internal/models"
	"hashpay/internal/service"
	"hashpay/internal/utils/log"
)

var version = "dev"

type state struct {
	cfg  *config.Config
	web  *httpapi.Server
	app  *service.App
	db   *models.Models
	jobs *jobs.Runner
	bot  *tgbot.Bot
}

func Run() error {
	log.Banner(buildVersion())

	cfg, err := config.LoadOrDefault()
	if err != nil {
		return err
	}
	log.SetDebug(cfg.Debug)

	state := &state{cfg: cfg}
	state.web = httpapi.New(httpapi.Config{
		Installed: installDone,
		BotToken: func() string {
			return state.cfg.Bot.Token
		},
		AdminID: func() int64 {
			return state.cfg.Bot.Admin
		},
		SetDB: func(req httpapi.DBConfig) (string, error) {
			return state.SetDB(req)
		},
		Debug: state.cfg.Debug,
	})

	log.Info("Web 服务运行在 %s", cfg.BindAddr())
	errCh := make(chan error, 1)
	go func() {
		errCh <- state.web.Start(cfg.BindAddr())
	}()
	started := false
	defer func() {
		if started {
			return
		}
		_ = state.web.Stop()
	}()

	if cfg.Server.Public == "" || cfg.Bot.Token == "" {
		if err := state.setup(); err != nil {
			return err
		}
	}

	if err := state.bootApp(); err != nil {
		log.Warn("服务启动失败: %v", err)
	}

	started = true
	return <-errCh
}

func openDB(cfg *config.Config) (*models.Models, error) {
	driver, dsn := cfg.DSN()
	if driver == "sqlite3" {
		if err := ensureDataPath(cfg.Database.SQLite.Path); err != nil {
			return nil, err
		}
	}
	db, err := models.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return models.New(db), nil
}

func (s *state) setAdmin(userID int64) error {
	s.cfg.Bot.Admin = userID
	if err := saveConfig(s.cfg); err != nil {
		return err
	}
	return nil
}

func (s *state) bootApp() error {
	repo, err := openDB(s.cfg)
	if err != nil {
		return err
	}
	s.db = repo

	s.app = service.New(s.db)
	s.web.SetRuntime(&httpapi.Runtime{App: s.app})

	rt, err := tgbot.NewBot(
		s.cfg,
		s.setAdmin,
		func() int64 { return s.cfg.Bot.Admin },
		func() *service.App { return s.app },
	)
	if err != nil {
		return err
	}
	s.bot = rt
	go rt.Start()

	s.jobs = jobs.New(s.db, s.app, s.cfg.Debug, s.bot)
	s.jobs.Start()
	return nil
}

func (s *state) setup() error {
	url, token, err := promptSetup()
	if err != nil {
		return err
	}

	s.cfg.Server.Public = url
	s.cfg.Bot.Token = token
	if err := saveConfig(s.cfg); err != nil {
		return err
	}
	return nil
}

func buildVersion() string {
	if value := strings.TrimSpace(version); value != "" && value != "dev" {
		return value
	}
	out, err := exec.Command("git", "describe", "--tags", "--always", "--dirty").Output()
	if err != nil {
		return version
	}
	value := strings.TrimSpace(string(out))
	if value == "" {
		return version
	}
	return value
}
