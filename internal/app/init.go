package app

import (
	"fmt"
	"math/rand"
	"net/url"
	"strings"
	"sync"
	"time"

	"hashpay/internal/api"
	"hashpay/internal/middleware"
	"hashpay/internal/ui"

	"github.com/gofiber/fiber/v3"
	tele "gopkg.in/telebot.v4"
)

func runInitFlow(configPath string, server *api.Server) (*Config, error) {
	ui.Title("👋 欢迎使用 HashPay！ 让我们来完成一些初始配置：")
	ui.Spacer()
	url := inputURL()
	token := inputBotToken()

	pin := fmt.Sprintf("%04d", rand.Intn(10000))
	ui.Action("请向机器人发送此安装确认码： %s", pin)

	adminID, err := waitPINConfirm(token, pin, url)
	if err != nil {
		return nil, fmt.Errorf("验证失败: %w", err)
	}

	ui.Success("验证成功，管理员 ID %d", adminID)
	ui.Spacer()
	ui.Title("请在 Telegram 中打开 Mini App 完成以下配置：")
	ui.Bullet(
		"选择数据库类型（SQLite 或 MySQL）",
		"配置支付方式",
		"系统设置",
	)
	ui.Spacer()
	ui.Info("正在等待配置完成…")

	cfg := waitForMiniAppConfig(server, token, adminID)

	db, err := createAndInitDB(cfg)
	if err != nil {
		return nil, fmt.Errorf("数据库初始化失败: %w", err)
	}
	defer db.Close()

	if err := saveAdmin(db, adminID, cfg); err != nil {
		return nil, fmt.Errorf("保存管理员失败: %w", err)
	}

	if err := saveConfig(configPath, cfg); err != nil {
		return nil, fmt.Errorf("保存配置失败: %w", err)
	}

	ui.Spacer()
	ui.Success("初始化完成")
	ui.Info("配置文件已保存到 %s", configPath)
	ui.Warn("系统将自动重启…")

	return cfg, nil
}

func inputURL() string {
	client := middleware.NewClient()
	client.SetTimeout(5 * time.Second)

	validate := func(val string) error {
		target := strings.TrimSpace(val)
		if target == "" {
			return fmt.Errorf("地址不能为空")
		}

		parsed, err := url.Parse(target)
		if err != nil {
			return fmt.Errorf("无效的 URL地址")
		}
		if parsed.Scheme != "https" {
			return fmt.Errorf("仅支持 HTTPS协议")
		}
		if parsed.Host == "" {
			return fmt.Errorf("地址格式不正确")
		}
		return nil
	}

	for {
		addr, err := ui.PromptText("请输入服务器外网访问地址", validate)
		if err != nil {
			ui.Error("读取地址失败: %v", err)
			continue
		}

		ui.Info("正在验证外网地址可访问性…")
		resp, reqErr := client.Get(addr)
		if reqErr != nil {
			ui.Error("无法访问该地址: %v", reqErr)
			continue
		}

		if !resp.Success {
			ui.Error("地址返回异常状态码: HTTP %d", resp.Code)
			continue
		}

		ui.Success("外网地址 %s 可访问 (HTTP %d)", addr, resp.Code)
		return addr
	}
}

func inputBotToken() string {
	validate := func(val string) error {
		if strings.TrimSpace(val) == "" {
			return fmt.Errorf("密钥不能为空")
		}
		parts := strings.SplitN(val, ":", 2)
		if len(parts) != 2 || parts[0] == "" {
			return fmt.Errorf("密钥格式不正确")
		}
		return nil
	}

	for {
		token, err := ui.PromptSecret("提供在 @BotFather 创建的机器人密钥", validate)
		if err != nil {
			ui.Error("读取 Token 失败: %v", err)
			continue
		}

		b, err := tele.NewBot(tele.Settings{
			Token:   token,
			Offline: false,
			Poller:  &tele.LongPoller{Timeout: 1 * time.Second},
		})
		if err != nil {
			ui.Error("密钥验证失败: %v", err)
			continue
		}

		me := b.Me
		if me == nil {
			ui.Error("获取机器人信息失败，请检查密钥是否有效")
			continue
		}

		ui.Success("机器人 @%s 登录成功", me.Username)
		return token
	}
}

func waitPINConfirm(token, pin, externalURL string) (int64, error) {
	b, err := tele.NewBot(tele.Settings{
		Token:  token,
		Poller: &tele.LongPoller{Timeout: 10 * time.Second},
	})
	if err != nil {
		return 0, err
	}

	result := make(chan int64)

	b.Handle("/start", func(c tele.Context) error {
		c.Send("🎉")
		msg := "欢迎使用 HashPay！\n\n我正在等待管理员验证，如果你有一个确认码，请告诉我。"
		return c.Send(msg)
	})

	b.Handle(tele.OnText, func(c tele.Context) error {
		userID := c.Sender().ID
		username := c.Sender().Username

		if strings.TrimSpace(c.Text()) == pin {
			ui.Success("管理员 %d (@%s) 完成了验证", userID, username)
			result <- userID

			keyboard := &tele.ReplyMarkup{}
			miniAppBtn := keyboard.WebApp("🚀 打开配置面板", &tele.WebApp{
				URL: externalURL,
			})
			keyboard.Inline(keyboard.Row(miniAppBtn))

			msg := "✅ 验证成功！您已成为系统管理员。\n\n"
			msg += "请点击下方按钮打开配置面板完成初始化设置："

			return c.Send(msg, keyboard)
		}

		ui.Warn("PIN 校验失败，用户 %d (@%s)", userID, username)
		return c.Send("❌ PIN 码错误，请重新输入")
	})

	go b.Start()
	defer b.Stop()

	select {
	case admin := <-result:
		return admin, nil
	case <-time.After(5 * time.Minute):
		return 0, fmt.Errorf("验证超时")
	}
}

func waitForMiniAppConfig(server *api.Server, token string, adminID int64) *Config {
	cfg := &Config{}
	cfg.Bot.Token = token
	cfg.Bot.Admin = adminID

	configChan := make(chan *Config, 1)
	var once sync.Once

	initGroup := server.App().Group("/api/init")

	initGroup.Options("/config", func(c fiber.Ctx) error {
		setInitHeaders(c)
		return c.SendStatus(fiber.StatusOK)
	})

	initGroup.Post("/config", func(c fiber.Ctx) error {
		setInitHeaders(c)

		var reqConfig struct {
			Database struct {
				Type  string `json:"type"`
				MySQL struct {
					Host     string `json:"host"`
					Port     int    `json:"port"`
					Database string `json:"database"`
					Username string `json:"username"`
					Password string `json:"password"`
				} `json:"mysql"`
			} `json:"database"`
			System struct {
				Currency    string  `json:"currency"`
				Timeout     int     `json:"timeout"`
				FastConfirm bool    `json:"fast_confirm"`
				RateAdjust  float64 `json:"rate_adjust"`
			} `json:"system"`
		}

		if err := c.Bind().JSON(&reqConfig); err != nil {
			ui.Error("配置解析失败: %v", err)
			return fiber.NewError(fiber.StatusBadRequest, "Invalid configuration")
		}

		cfg.Database.Type = reqConfig.Database.Type
		if reqConfig.Database.Type == "mysql" {
			cfg.Database.MySQL.Host = reqConfig.Database.MySQL.Host
			cfg.Database.MySQL.Port = reqConfig.Database.MySQL.Port
			cfg.Database.MySQL.Database = reqConfig.Database.MySQL.Database
			cfg.Database.MySQL.Username = reqConfig.Database.MySQL.Username
			cfg.Database.MySQL.Password = reqConfig.Database.MySQL.Password
		} else {
			cfg.Database.Type = "sqlite"
			if strings.TrimSpace(cfg.Database.SQLite.Path) == "" {
				cfg.Database.SQLite.Path = "./data/hashpay.db"
			}
		}
		cfg.System.Currency = reqConfig.System.Currency
		cfg.System.Timeout = reqConfig.System.Timeout
		cfg.System.FastConfirm = reqConfig.System.FastConfirm
		cfg.System.RateAdjust = reqConfig.System.RateAdjust

		ui.Info("已接收到配置: 数据库=%s, 货币=%s",
			cfg.Database.Type, cfg.System.Currency)

		once.Do(func() {
			configChan <- cfg
		})

		return c.JSON(fiber.Map{"status": "ok"})
	})

	initGroup.Options("/health", func(c fiber.Ctx) error {
		setInitHeaders(c)
		return c.SendStatus(fiber.StatusOK)
	})

	initGroup.Get("/health", func(c fiber.Ctx) error {
		setInitHeaders(c)
		return c.JSON(fiber.Map{
			"status":   "ready",
			"admin_id": adminID,
		})
	})

	select {
	case config := <-configChan:
		ui.Success("配置接收完成")
		return config
	case <-time.After(30 * time.Minute):
		ui.Warn("配置超时，使用默认设置")
		cfg.Database.Type = "sqlite"
		cfg.Database.SQLite.Path = "./data/hashpay.db"
		cfg.System.Currency = "CNY"
		cfg.System.Timeout = 1800
		cfg.System.FastConfirm = true
		cfg.System.RateAdjust = 0.00
		return cfg
	}
}

func setInitHeaders(c fiber.Ctx) {
	c.Set("Access-Control-Allow-Origin", "*")
	c.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	c.Set("Access-Control-Allow-Headers", "Content-Type")
}
