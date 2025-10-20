package app

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"time"

	tele "gopkg.in/telebot.v4"
	"hashpay/internal/ui"
)

func runInitFlow(configPath string) (*Config, error) {
	token := inputBotToken()

	pin := genPIN()
	ui.Spacer()
	ui.Action("已生成一次性管理员 PIN %s", pin)
	ui.Text("请向机器人发送 /start 并输入此 PIN 码完成验证")
	ui.Spacer()

	adminID, err := waitForPINVerify(token, pin)
	if err != nil {
		return nil, fmt.Errorf("PIN 验证失败: %w", err)
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

	cfg := waitForMiniAppConfig(token, adminID)

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

func inputBotToken() string {
	validate := func(val string) error {
		if strings.TrimSpace(val) == "" {
			return fmt.Errorf("Token 不能为空")
		}
		return nil
	}

	for {
		token, err := ui.PromptSecret("请提供在 @BotFather 创建的机器人密钥", validate)
		if err != nil {
			ui.Error("读取 Token 失败: %v", err)
			continue
		}

		testBot, err := tele.NewBot(tele.Settings{
			Token:   token,
			Offline: false,
			Poller:  &tele.LongPoller{Timeout: 1 * time.Second},
		})
		if err != nil {
			ui.Error("Token 验证失败: %v", err)
			ui.Text("请重新输入…")
			continue
		}

		me := testBot.Me
		testBot.Stop()

		if me == nil {
			ui.Warn("无法获取机器人信息，请检查网络连接")
			continue
		}

		ui.Spacer()
		ui.Success("Bot 验证成功")
		ui.Info("Bot 名称 @%s", me.Username)
		ui.Info("Bot ID %d", me.ID)
		return token
	}
}

func genPIN() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("%04d", rand.Intn(10000))
}

func waitForPINVerify(token, expectedPIN string) (int64, error) {
	b, err := tele.NewBot(tele.Settings{
		Token:  token,
		Poller: &tele.LongPoller{Timeout: 10 * time.Second},
	})
	if err != nil {
		return 0, err
	}

	adminChan := make(chan int64)

	b.Handle("/start", func(c tele.Context) error {
		userID := c.Sender().ID
		username := c.Sender().Username
		ui.Debug("收到 /start 请求，用户 %d (@%s)", userID, username)

		msg := "🎉 欢迎使用 HashPay 支付系统!\n\n"
		msg += "请输入控制台显示的 4 位 PIN 码完成管理员验证："

		return c.Send(msg)
	})

	b.Handle(tele.OnText, func(c tele.Context) error {
		pin := strings.TrimSpace(c.Text())
		userID := c.Sender().ID
		username := c.Sender().Username
		ui.Debug("收到 PIN 输入，用户 %d (@%s): %s", userID, username, pin)

		if pin == expectedPIN {
			ui.Success("用户 %d (@%s) 完成 PIN 验证", userID, username)
			adminChan <- userID

			keyboard := &tele.ReplyMarkup{}
			miniAppBtn := keyboard.WebApp("🚀 打开配置面板", &tele.WebApp{
				URL: "https://dc0j7pr9-8080.asse.devtunnels.ms/",
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
	case adminID := <-adminChan:
		return adminID, nil
	case <-time.After(5 * time.Minute):
		return 0, fmt.Errorf("验证超时")
	}
}

func waitForMiniAppConfig(token string, adminID int64) *Config {
	cfg := &Config{}
	cfg.Bot.Token = token
	cfg.Bot.Admin = adminID

	configChan := make(chan *Config)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/init/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

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

		if err := json.NewDecoder(r.Body).Decode(&reqConfig); err != nil {
			ui.Error("配置解析失败: %v", err)
			http.Error(w, "Invalid configuration", http.StatusBadRequest)
			return
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
			cfg.Database.SQLite.Path = "./data/hashpay.db"
		}
		cfg.System.Currency = reqConfig.System.Currency
		cfg.System.Timeout = reqConfig.System.Timeout
		cfg.System.FastConfirm = reqConfig.System.FastConfirm
		cfg.System.RateAdjust = reqConfig.System.RateAdjust

		ui.Info("已接收到配置: 数据库=%s, 货币=%s",
			cfg.Database.Type, cfg.System.Currency)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

		configChan <- cfg
	})

	mux.HandleFunc("/api/init/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "ready",
			"admin_id": adminID,
		})
	})

	const configServerAddr = ":8090"

	server := &http.Server{
		Addr:    configServerAddr,
		Handler: mux,
	}

	go func() {
		ui.Info("配置服务器启动在 %s", configServerAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			ui.Error("配置服务器错误: %v", err)
		}
	}()

	select {
	case config := <-configChan:
		ui.Success("配置接收完成")
		_ = server.Close()
		return config
	case <-time.After(30 * time.Minute):
		ui.Warn("配置超时，使用默认设置")
		_ = server.Close()
		cfg.Database.Type = "sqlite"
		cfg.Database.SQLite.Path = "./data/hashpay.db"
		cfg.System.Currency = "CNY"
		cfg.System.Timeout = 1800
		cfg.System.FastConfirm = true
		cfg.System.RateAdjust = 0.00
		return cfg
	}
}
