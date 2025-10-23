package app

import (
	"errors"
	"fmt"
	"os"

	"hashpay/internal/api"
	"hashpay/internal/bot"
	"hashpay/internal/ui"
)

const (
	configPath = "config.yaml"
)

func Run() error {
	ui.Banner("v1.0.0")

	var cfg *Config
	bind := ":8181"
	init := false

	info, err := os.Stat(configPath)
	if err == nil && !info.IsDir() {
		loadedCfg, loadErr := loadConfig(configPath)
		if loadErr != nil {
			return fmt.Errorf("failed to load config: %w", loadErr)
		}
		cfg = loadedCfg
		bind = cfg.BindAddr(bind)
		if !cfg.HasDatabase() {
			init = true
		}
	} else if errors.Is(err, os.ErrNotExist) {
		init = true
	} else if err != nil {
		ui.Error("无法读取配置文件: %v", err)
		return nil
	}

	var server *api.Server
	if init {
		server = api.NewServer(nil)
		go func() {
			if startErr := server.Start(bind); startErr != nil {
				ui.Error("无法启动服务器: %v", startErr)
			}
		}()
		cfg, err = runInitFlow(configPath, server)
		if err != nil {
			_ = server.Stop()
			return err
		}

		bind = cfg.BindAddr(bind)
		server.Stop()
	}

	if cfg == nil {
		cfg, loadErr := loadConfig(configPath)
		if loadErr != nil {
			return fmt.Errorf("failed to load config: %w", loadErr)
		}
		bind = cfg.BindAddr(bind)
	}

	if !cfg.HasDatabase() {
		return fmt.Errorf("database is not configured")
	}

	db, err := connectDB(cfg)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer db.Close()

	telegram, err := bot.New(
		&bot.Config{
			Token: cfg.Bot.Token,
			Admin: cfg.Bot.Admin,
		}, db,
	)
	if err != nil {
		return fmt.Errorf("failed to initialize bot: %w", err)
	}

	server = api.NewServer(db)
	go func() {
		if startErr := server.Start(bind); startErr != nil {
			ui.Error("服务异常: %v", startErr)
		}
	}()

	ui.Success("HashPay 启动成功")
	ui.Info("Bot 已连接 @%s", telegram.Username())

	telegram.Start()
	return nil
}
