package app

import (
	cryptorand "crypto/rand"
	"encoding/hex"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"hashpay/internal/config"
	"hashpay/internal/handler"
	"hashpay/internal/model"
	"hashpay/internal/pkg/log"
	"hashpay/internal/repository"

	"github.com/gofiber/fiber/v3"
	"github.com/manifoldco/promptui"
	tele "gopkg.in/telebot.v4"
)

// runSetup 运行初始化设置
func runSetup(cfg *config.Config, setupHandler *handler.Handler, onConfigured func(*config.Config) error) (*config.Config, error) {
	log.Info("欢迎使用 HashPay！让我们来完成一些初始配置：")
	log.Info("请先通过 反向代理/转发 配置好公网访问地址，并配置好 HTTPS。")
	fmt.Println()
	if setupHandler == nil {
		return nil, fmt.Errorf("初始化服务未启动")
	}

	// 输入公网地址
	externalURL, err := inputExternalURL(cfg.Server.Public)
	if err != nil {
		return nil, err
	}
	cfg.Server.Public = externalURL

	// 输入 Bot Token
	token, err := inputBotToken(cfg.Bot.Token)
	if err != nil {
		return nil, err
	}
	cfg.Bot.Token = token

	if cfg.Bot.Admin <= 0 {
		adminID, err := waitPINConfirm(token, externalURL)
		if err != nil {
			return nil, err
		}
		cfg.Bot.Admin = adminID
	}
	if err := config.Save(config.ConfigPath, cfg); err != nil {
		return nil, fmt.Errorf("保存配置失败: %w", err)
	}
	log.Success("Telegram 管理员已设置。")

	// 启用初始化模式
	setupHandler.Init.Enable(cfg.Bot.Admin)

	log.Info("请在Telegram中打开配置面板以继续完成配置。")
	registerInitConfigHandler(setupHandler, cfg, onConfigured)

	return cfg, nil
}

func inputExternalURL(current string) (string, error) {
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	tryCurrent := strings.TrimRight(strings.TrimSpace(current), "/")
	if tryCurrent != "" {
		addr, err := validateExternalURL(tryCurrent)
		if err == nil {
			log.Info("正在验证公网地址可访问性…")
			if err := verifyExternalURL(client, addr); err == nil {
				log.Success("已设置 %s 为公网地址。", addr)
				return addr, nil
			}
			log.Warn("当前配置的公网地址不可访问，请重新输入。")
		} else {
			log.Warn("当前配置的公网地址格式无效，请重新输入。")
		}
	}

	for {
		prompt := promptui.Prompt{
			Label: "输入公网访问地址 (如 https://pay.example.com)",
		}

		addr, err := runPrompt(prompt)
		if err != nil {
			if err == ErrInterrupted {
				return "", err
			}
			log.Warn("读取失败: %v", err)
			continue
		}
		addr = strings.TrimSpace(addr)
		addr = strings.TrimRight(addr, "/")

		addr, err = validateExternalURL(addr)
		if err != nil {
			log.Warn(err.Error())
			continue
		}

		log.Info("正在验证公网地址可访问性…")
		if err := verifyExternalURL(client, addr); err != nil {
			log.Warn("无法访问该地址，请检查域名解析、HTTPS 证书或反向代理后重试。")
			log.Debug("公网地址检测失败: addr=%s err=%v", addr, err)
			continue
		}

		log.Success("已设置 %s 为公网地址。", addr)
		return addr, nil
	}
}

func validateExternalURL(addr string) (string, error) {
	if addr == "" {
		return "", fmt.Errorf("地址不能为空")
	}
	parsed, err := url.Parse(addr)
	if err != nil {
		return "", fmt.Errorf("无效的 URL 地址")
	}
	if parsed.Scheme != "https" {
		return "", fmt.Errorf("仅支持 HTTPS 协议")
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("地址格式不正确")
	}
	return addr, nil
}

func verifyExternalURL(client *http.Client, addr string) error {
	checkURL := strings.TrimRight(addr, "/") + "/health"
	resp, err := client.Get(checkURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("health returned status %d", resp.StatusCode)
	}
	return nil
}

func inputBotToken(current string) (string, error) {
	tryCurrent := strings.TrimSpace(current)
	if tryCurrent != "" {
		if username, err := verifyBotToken(tryCurrent); err == nil {
			log.Success("已配置 @%s", username)
			return tryCurrent, nil
		}
		log.Warn("当前配置中的 Bot Token 无效，请重新输入。")
	}

	log.Info("接下来，输入你在 Telegram 的 @Botfather 中创建机器人的 Token")
	for {
		prompt := promptui.Prompt{
			Label: "输入 Bot Token",
			Mask:  '*',
		}

		token, err := runPrompt(prompt)
		if err != nil {
			if err == ErrInterrupted {
				return "", err
			}
			log.Warn("读取失败: %v", err)
			continue
		}
		token = strings.TrimSpace(token)

		username, err := verifyBotToken(token)
		if err != nil {
			log.Warn(err.Error())
			continue
		}

		log.Success("已配置 @%s", username)
		return token, nil
	}
}

func verifyBotToken(token string) (string, error) {
	if token == "" {
		return "", fmt.Errorf("Token 不能为空")
	}

	parts := strings.SplitN(token, ":", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("Token 格式不正确")
	}

	log.Info("正在验证机器人信息...")
	b, err := tele.NewBot(tele.Settings{
		Token:  token,
		Poller: &tele.LongPoller{Timeout: 1 * time.Second},
	})
	if err != nil {
		return "", fmt.Errorf("Token 验证失败: %v", err)
	}
	if b.Me == nil {
		return "", fmt.Errorf("无法获取 Bot 信息")
	}
	return b.Me.Username, nil
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
		return c.Send("欢迎使用 HashPay！\n\n请发送验证码以进行下一步的配置。")
	})

	b.Handle(tele.OnText, func(c tele.Context) error {
		if strings.TrimSpace(c.Text()) == pin {
			result <- c.Sender().ID

			// 发送带 Mini App 按钮的消息
			keyboard := &tele.ReplyMarkup{}
			miniAppURL := strings.TrimRight(externalURL, "/") + "/app"
			miniAppBtn := keyboard.WebApp("🚀 打开配置面板", &tele.WebApp{
				URL: miniAppURL,
			})
			keyboard.Inline(keyboard.Row(miniAppBtn))

			msg := "✅ 验证成功！您已成为管理员。\n\n"
			msg += "请打开配置面板以继续完成初始化配置："

			return c.Send(msg, keyboard)
		}
		return c.Send("❌ 验证码错误，请重试。")
	})

	go b.Start()
	defer b.Stop()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigCh)

	select {
	case adminID := <-result:
		return adminID, nil
	case <-sigCh:
		return 0, ErrInterrupted
	}
}

type initSystemConfig struct {
	Currency    string
	Timeout     int
	FastConfirm bool
	RateAdjust  float64
}

type initMerchantConfig struct {
	Name     string `json:"name"`
	Callback string `json:"callback"`
	APIKey   string `json:"api_key"`
}

func generateToken(prefix string, size int) (string, error) {
	bytes := make([]byte, size)
	if _, err := cryptorand.Read(bytes); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(bytes), nil
}

func registerInitConfigHandler(h *handler.Handler, cfg *config.Config, onConfigured func(*config.Config) error) {
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
			Merchants []initMerchantConfig `json:"merchants"`
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

		systemCfg := initSystemConfig{
			Currency:    strings.TrimSpace(reqConfig.System.Currency),
			Timeout:     reqConfig.System.Timeout,
			FastConfirm: reqConfig.System.FastConfirm,
			RateAdjust:  reqConfig.System.RateAdjust,
		}

		if err := finalizeInitConfig(cfg, systemCfg, reqConfig.Merchants); err != nil {
			log.Error("初始化配置失败: %v", err)
			return fiber.NewError(fiber.StatusInternalServerError, "配置保存失败")
		}

		if onConfigured != nil {
			if err := onConfigured(cfg); err != nil {
				log.Error("业务服务启动失败: %v", err)
				return fiber.NewError(fiber.StatusInternalServerError, "业务服务启动失败")
			}
		}

		mu.Lock()
		configured = true
		mu.Unlock()
		h.Init.Disable()
		log.Success("配置接收完成")

		return c.JSON(fiber.Map{"status": "ok", "ready": true})
	})
}

func finalizeInitConfig(cfg *config.Config, system initSystemConfig, merchants []initMerchantConfig) error {
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
	defer db.Close()

	if err := db.Migrate(); err != nil {
		return fmt.Errorf("数据库迁移失败: %w", err)
	}

	if system.Currency == "" {
		system.Currency = "CNY"
	}
	if system.Timeout <= 0 {
		system.Timeout = 1800
	}

	configRepo := repository.NewConfigRepo(db)
	if err := configRepo.Set("currency", system.Currency); err != nil {
		return fmt.Errorf("保存基础货币失败: %w", err)
	}
	if err := configRepo.Set("timeout", fmt.Sprintf("%d", system.Timeout)); err != nil {
		return fmt.Errorf("保存订单超时失败: %w", err)
	}
	if err := configRepo.Set("fast_confirm", fmt.Sprintf("%t", system.FastConfirm)); err != nil {
		return fmt.Errorf("保存快速确认失败: %w", err)
	}
	if err := configRepo.Set("rate_adjust", fmt.Sprintf("%g", system.RateAdjust)); err != nil {
		return fmt.Errorf("保存汇率微调失败: %w", err)
	}

	siteRepo := repository.NewSiteRepo(db)
	for _, merchant := range merchants {
		name := strings.TrimSpace(merchant.Name)
		if name == "" {
			continue
		}

		apiKey := strings.TrimSpace(merchant.APIKey)
		if apiKey == "" {
			generated, err := generateToken("hp_", 16)
			if err != nil {
				return fmt.Errorf("生成商户安全密钥失败: %w", err)
			}
			apiKey = generated
		}

		siteID, err := generateToken("site_", 8)
		if err != nil {
			return fmt.Errorf("生成商户ID失败: %w", err)
		}

		now := time.Now()
		if err := siteRepo.Create(&model.Site{
			ID:        siteID,
			Name:      name,
			APIKey:    apiKey,
			Callback:  strings.TrimSpace(merchant.Callback),
			CreatedAt: now,
			UpdatedAt: now,
		}); err != nil {
			return fmt.Errorf("创建商户失败: %w", err)
		}
	}

	// 保存配置
	if err := config.Save(config.ConfigPath, cfg); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}

	return nil
}
