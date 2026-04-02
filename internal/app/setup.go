package app

import (
	"bufio"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"hashpay/internal/config"
	"hashpay/internal/handler"
	"hashpay/internal/model"
	"hashpay/internal/pkg/log"
	"hashpay/internal/repository"

	"github.com/gofiber/fiber/v3"
	tele "gopkg.in/telebot.v4"
)

// runSetup 运行初始化设置
func runSetup(cfg *config.Config, setupHandler *handler.Handler) (*config.Config, error) {
	log.Info("欢迎使用 HashPay！让我们来完成初始化设置：")
	fmt.Println()
	if setupHandler == nil {
		return nil, fmt.Errorf("初始化服务未启动")
	}

	// 输入公网地址
	externalURL := inputExternalURL()

	// 输入 Bot Token
	token, err := inputBotToken()
	if err != nil {
		return nil, err
	}
	cfg.Bot.Token = token

	// PIN 验证
	adminID, err := waitPINConfirm(token, externalURL)
	if err != nil {
		return nil, err
	}
	cfg.Bot.Admin = adminID
	log.Success("管理员已设置: TID %d", adminID)

	// 启用初始化模式
	setupHandler.Init.Enable(adminID)

	log.Info("请在 Telegram 中打开 Mini App 完成以下配置：")
	log.Info("  • 选择数据库类型（SQLite 或 MySQL）")
	log.Info("  • 配置支付方式")
	log.Info("  • 系统设置")
	registerInitConfigHandler(setupHandler, cfg)
	fmt.Println()
	log.Info("配置提交后会自动保存，请重启服务以加载完整功能")

	return cfg, nil
}

func inputExternalURL() string {
	reader := bufio.NewReader(os.Stdin)
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	for {
		fmt.Print("请输入公网访问地址 (如 https://pay.example.com): ")
		addr, err := reader.ReadString('\n')
		if err != nil {
			log.Warn("读取失败: %v", err)
			continue
		}
		addr = strings.TrimSpace(addr)
		addr = strings.TrimRight(addr, "/")

		if addr == "" {
			log.Warn("地址不能为空")
			continue
		}

		parsed, err := url.Parse(addr)
		if err != nil {
			log.Warn("无效的 URL 地址")
			continue
		}

		if parsed.Scheme != "https" {
			log.Warn("仅支持 HTTPS 协议")
			continue
		}

		if parsed.Host == "" {
			log.Warn("地址格式不正确")
			continue
		}

		checkURL := strings.TrimRight(addr, "/") + "/health"
		log.Info("正在验证外网地址可访问性…")
		resp, reqErr := client.Get(checkURL)
		if reqErr != nil {
			log.Warn("无法访问该地址: %v", reqErr)
			continue
		}
		resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			log.Warn("地址返回异常状态码: HTTP %d", resp.StatusCode)
			continue
		}

		log.Success("外网地址 %s 可访问 (HTTP %d)", addr, resp.StatusCode)
		return addr
	}
}

func inputBotToken() (string, error) {
	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Print("请输入 Telegram Bot Token: ")
		token, err := reader.ReadString('\n')
		if err != nil {
			return "", err
		}
		token = strings.TrimSpace(token)

		if token == "" {
			log.Warn("Token 不能为空")
			continue
		}

		// 验证 Token 格式
		parts := strings.SplitN(token, ":", 2)
		if len(parts) != 2 {
			log.Warn("Token 格式不正确")
			continue
		}

		// 验证 Token 有效性
		log.Info("正在验证 Token...")
		b, err := tele.NewBot(tele.Settings{
			Token:  token,
			Poller: &tele.LongPoller{Timeout: 1 * time.Second},
		})
		if err != nil {
			log.Error("Token 验证失败: %v", err)
			continue
		}

		if b.Me == nil {
			log.Error("无法获取 Bot 信息")
			continue
		}

		log.Success("Bot @%s 验证成功", b.Me.Username)
		return token, nil
	}
}

func waitPINConfirm(token, externalURL string) (int64, error) {
	pin := fmt.Sprintf("%04d", rand.Intn(10000))
	log.Info("接下来，请向机器人发送此验证码: %s", pin)

	b, err := tele.NewBot(tele.Settings{
		Token:  token,
		Poller: &tele.LongPoller{Timeout: 10 * time.Second},
	})
	if err != nil {
		return 0, err
	}

	result := make(chan int64, 1)

	b.Handle("/start", func(c tele.Context) error {
		c.Send("🎉")
		return c.Send("欢迎使用 HashPay！\n\n请发送安装验证码完成管理员绑定。")
	})

	b.Handle(tele.OnText, func(c tele.Context) error {
		if strings.TrimSpace(c.Text()) == pin {
			result <- c.Sender().ID

			// 发送带 Mini App 按钮的消息
			keyboard := &tele.ReplyMarkup{}
			miniAppBtn := keyboard.WebApp("🚀 打开配置面板", &tele.WebApp{
				URL: externalURL,
			})
			keyboard.Inline(keyboard.Row(miniAppBtn))

			msg := "✅ 验证成功！您已成为管理员。\n\n"
			msg += "请点击下方按钮打开配置面板完成初始化设置："

			return c.Send(msg, keyboard)
		}
		return c.Send("❌ 验证码错误，请重试。")
	})

	go b.Start()
	defer b.Stop()

	select {
	case adminID := <-result:
		return adminID, nil
	case <-time.After(5 * time.Minute):
		return 0, fmt.Errorf("验证超时")
	}
}

func registerInitConfigHandler(h *handler.Handler, cfg *config.Config) {
	var mu sync.Mutex
	configured := false

	h.Init.SetCallback(cfg.Bot.Admin, func(c fiber.Ctx) error {
		// 设置 CORS
		c.Set("Access-Control-Allow-Origin", "*")
		c.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Set("Access-Control-Allow-Headers", "Content-Type")

		if c.Method() == "OPTIONS" {
			return c.SendStatus(204)
		}

		mu.Lock()
		if configured {
			mu.Unlock()
			return c.JSON(fiber.Map{"status": "ok", "message": "配置已完成"})
		}
		mu.Unlock()

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
			log.Error("配置解析失败: %v", err)
			return fiber.NewError(fiber.StatusBadRequest, "配置格式错误")
		}

		// 应用配置
		cfg.Database.Type = reqConfig.Database.Type
		if reqConfig.Database.Type == "mysql" {
			cfg.Database.MySQL.Host = strings.TrimSpace(reqConfig.Database.MySQL.Host)
			cfg.Database.MySQL.Port = reqConfig.Database.MySQL.Port
			cfg.Database.MySQL.Database = strings.TrimSpace(reqConfig.Database.MySQL.Database)
			cfg.Database.MySQL.Username = strings.TrimSpace(reqConfig.Database.MySQL.Username)
			cfg.Database.MySQL.Password = reqConfig.Database.MySQL.Password
		} else {
			cfg.Database.Type = "sqlite"
			cfg.Database.SQLite.Path = "./data/hashpay.db"
		}

		log.Info("已接收到配置: 数据库=%s", cfg.Database.Type)

		if err := finalizeInitConfig(cfg); err != nil {
			log.Error("初始化配置失败: %v", err)
			return fiber.NewError(fiber.StatusInternalServerError, "配置保存失败")
		}

		mu.Lock()
		configured = true
		mu.Unlock()
		h.Init.Disable()
		log.Success("配置接收完成，请重启服务")

		return c.JSON(fiber.Map{"status": "ok", "restart": true})
	})
}

func finalizeInitConfig(cfg *config.Config) error {
	// 确保数据目录存在
	if cfg.Database.Type == "sqlite" {
		if err := ensureDataDir(cfg.Database.SQLite.Path); err != nil {
			return fmt.Errorf("创建数据目录失败: %w", err)
		}
	}

	// 初始化数据库
	driver, dsn := cfg.DSN()
	db, err := repository.Open(driver, dsn)
	if err != nil {
		return fmt.Errorf("连接数据库失败: %w", err)
	}

	if err := db.Migrate(); err != nil {
		db.Close()
		return fmt.Errorf("数据库迁移失败: %w", err)
	}

	// 创建管理员用户
	userRepo := repository.NewUserRepo(db)
	now := time.Now()
	userRepo.Create(&model.User{
		TgID:      cfg.Bot.Admin,
		IsAdmin:   true,
		CreatedAt: now,
		UpdatedAt: now,
	})

	db.Close()

	// 保存配置
	if err := config.Save(config.ConfigPath, cfg); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	return nil
}
