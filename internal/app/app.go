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
	configPath      = "config.yaml"
	defaultHTTPAddr = ":8080"
)

func Run() error {
	cfg, err := initConfig(configPath)
	if err != nil {
		return err
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
		}, db)
	if err != nil {
		return fmt.Errorf("failed to initialize bot: %w", err)
	}

	server := api.NewServer(db)
	go func() {
		if err := server.Start(defaultHTTPAddr); err != nil {
			ui.Error("API 服务异常: %v", err)
		}
	}()

	ui.Success("HashPay 启动成功")
	ui.Info("Web API 地址 http://localhost%s", defaultHTTPAddr)
	ui.Info("Bot 已连接 @%s", telegram.Username())

	telegram.Start()
	return nil
}

func initConfig(path string) (*Config, error) {
	ui.Banner("v1.0.0")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			ui.Title("👋 欢迎使用 HashPay！ 让我们来完成初始配置")
			ui.Spacer()

			cfg, initErr := runInitFlow(path)
			if initErr != nil {
				return nil, fmt.Errorf("初始化失败: %w", initErr)
			}
			return cfg, nil
		}
		return nil, fmt.Errorf("检查配置文件失败: %w", err)
	}

	cfg, err := loadConfig(path)
	if err != nil {
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}
	return cfg, nil
}
