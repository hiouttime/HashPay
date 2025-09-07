package main

import (
	"bufio"
	"database/sql"
	_ "embed"
	"fmt"
	"hashpay/internal/api"
	"hashpay/internal/bot"
	"hashpay/internal/database"
	"io/ioutil"
	"log"
	"math/rand"
	"os"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"gopkg.in/yaml.v3"
	tele "gopkg.in/telebot.v4"
)

//go:embed migrations/init.sql
var embeddedMigrationSQL string

type Config struct {
	Bot struct {
		Token string `yaml:"token"`
	} `yaml:"bot"`
	Database struct {
		Type   string `yaml:"type"`
		SQLite struct {
			Path string `yaml:"path"`
		} `yaml:"sqlite"`
		MySQL struct {
			Host     string `yaml:"host"`
			Port     int    `yaml:"port"`
			Database string `yaml:"database"`
			Username string `yaml:"username"`
			Password string `yaml:"password"`
		} `yaml:"mysql"`
	} `yaml:"database"`
	System struct {
		Currency    string  `yaml:"currency"`
		Timeout     int     `yaml:"timeout"`
		FastConfirm bool    `yaml:"fast_confirm"`
		RateAdjust  float64 `yaml:"rate_adjust"`
	} `yaml:"system"`
	Admin struct {
		TgID int64 `yaml:"tg_id"`
	} `yaml:"admin"`
}

func main() {
	// 检查配置文件是否存在
	if _, err := os.Stat("config.yaml"); os.IsNotExist(err) {
		// 新安装，开始初始化流程
		log.Println("========================================")
		log.Println("     欢迎使用 HashPay 支付系统")
		log.Println("========================================\n")
		log.Println("未找到配置文件，开始初始化...")
		
		if err := runInitFlow(); err != nil {
			log.Fatal("初始化失败:", err)
		}
	}
	
	// 加载配置并正常启动
	cfg := loadConfig()
	
	// 连接数据库
	database, err := connectDB(cfg)
	if err != nil {
		log.Fatal("数据库连接失败:", err)
	}
	defer database.Close()
	
	// 创建 Bot
	botCfg := &bot.Config{
		Token:   cfg.Bot.Token,
		AdminID: cfg.Admin.TgID,
	}
	
	b, err := bot.New(botCfg, database)
	if err != nil {
		log.Fatal("Bot 初始化失败:", err)
	}
	
	// 启动 API 服务
	go func() {
		apiServer := api.NewServer(database)
		if err := apiServer.Start(":8080"); err != nil {
			log.Printf("API Server error: %v", err)
		}
	}()
	
	log.Println("HashPay 启动成功!")
	log.Println("Web API: http://localhost:8080")
	log.Println("Bot: @" + b.Username())
	
	b.Start()
}

// 初始化流程
func runInitFlow() error {
	// 步骤1: 输入并验证 Bot Token
	token, botInfo := inputAndValidateToken()
	
	// 步骤2: 生成 PIN 码
	pin := genPIN()
	fmt.Printf("\n📌 请记住此 PIN 码: %s\n", pin)
	fmt.Println("请向机器人发送 /start 并输入此 PIN 码完成验证\n")
	
	// 步骤3: 启动临时 Bot 等待 PIN 验证
	adminID, err := waitForPINVerify(token, pin)
	if err != nil {
		return fmt.Errorf("PIN 验证失败: %w", err)
	}
	
	fmt.Printf("✅ 验证成功! 管理员 ID: %d\n\n", adminID)
	
	// 步骤4: 提示打开 Mini App 进行配置
	fmt.Println("请在 Telegram 中打开 Mini App 完成以下配置：")
	fmt.Println("1. 选择数据库类型（SQLite 或 MySQL）")
	fmt.Println("2. 配置支付方式")
	fmt.Println("3. 系统设置")
	fmt.Println("\n正在等待配置完成...")
	
	// 步骤5: 启动配置 API，等待 Mini App 配置
	cfg := waitForMiniAppConfig(token, adminID, botInfo)
	
	// 步骤6: 创建数据库并初始化
	database, err := createAndInitDB(cfg)
	if err != nil {
		return fmt.Errorf("数据库初始化失败: %w", err)
	}
	defer database.Close()
	
	// 步骤7: 保存管理员信息
	if err := saveAdmin(database, adminID); err != nil {
		return fmt.Errorf("保存管理员失败: %w", err)
	}
	
	// 步骤8: 保存配置文件
	if err := saveConfig(cfg); err != nil {
		return fmt.Errorf("保存配置失败: %w", err)
	}
	
	fmt.Println("\n✅ 初始化完成！")
	fmt.Println("配置文件已保存到 config.yaml")
	fmt.Println("系统将自动重启...")
	
	return nil
}

// 输入并验证 Token
func inputAndValidateToken() (string, *tele.User) {
	reader := bufio.NewReader(os.Stdin)
	
	for {
		fmt.Print("请输入 Telegram Bot Token: ")
		token, _ := reader.ReadString('\n')
		token = strings.TrimSpace(token)
		
		if token == "" {
			fmt.Println("❌ Token 不能为空")
			continue
		}
		
		// 验证 Token
		testBot, err := tele.NewBot(tele.Settings{
			Token:   token,
			Offline: true,
		})
		
		if err != nil {
			fmt.Printf("❌ Token 验证失败: %v\n", err)
			fmt.Println("请重新输入...")
			continue
		}
		
		me := testBot.Me
		fmt.Printf("\n✅ Bot 验证成功!\n")
		fmt.Printf("Bot 名称: @%s\n", me.Username)
		fmt.Printf("Bot ID: %d\n", me.ID)
		
		return token, me
	}
}

// 生成 PIN 码
func genPIN() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("%04d", rand.Intn(10000))
}

// 等待 PIN 验证
func waitForPINVerify(token, expectedPIN string) (int64, error) {
	pref := tele.Settings{
		Token:  token,
		Poller: &tele.LongPoller{Timeout: 10 * time.Second},
	}
	
	b, err := tele.NewBot(pref)
	if err != nil {
		return 0, err
	}
	
	adminChan := make(chan int64)
	errorChan := make(chan error)
	
	// 处理 /start 命令
	b.Handle("/start", func(c tele.Context) error {
		// 发送欢迎消息
		msg := "🎉 欢迎使用 HashPay 支付系统!\n\n"
		msg += "请输入控制台显示的 4 位 PIN 码完成管理员验证："
		
		return c.Send(msg)
	})
	
	// 处理文本消息（PIN 码）
	b.Handle(tele.OnText, func(c tele.Context) error {
		pin := strings.TrimSpace(c.Text())
		
		if pin == expectedPIN {
			// PIN 正确
			adminChan <- c.Sender().ID
			
			// 发送成功消息和 Mini App 按钮
			keyboard := &tele.ReplyMarkup{}
			miniAppBtn := keyboard.WebApp("🚀 打开配置面板", &tele.WebApp{
				URL: "https://hashpay.example.com/miniapp",
			})
			keyboard.Inline(keyboard.Row(miniAppBtn))
			
			msg := "✅ 验证成功！您已成为系统管理员。\n\n"
			msg += "请点击下方按钮打开配置面板完成初始化设置："
			
			return c.Send(msg, keyboard)
		}
		
		// PIN 错误
		return c.Send("❌ PIN 码错误，请重新输入")
	})
	
	// 启动 Bot
	go b.Start()
	defer b.Stop()
	
	// 等待验证结果
	select {
	case adminID := <-adminChan:
		return adminID, nil
	case err := <-errorChan:
		return 0, err
	case <-time.After(5 * time.Minute):
		return 0, fmt.Errorf("验证超时")
	}
}

// 等待 Mini App 配置
func waitForMiniAppConfig(token string, adminID int64, botInfo *tele.User) *Config {
	// 创建临时 API 服务器接收 Mini App 的配置
	cfg := &Config{}
	cfg.Bot.Token = token
	cfg.Admin.TgID = adminID
	
	configChan := make(chan *Config)
	
	// 启动临时 HTTP 服务器
	go func() {
		// TODO: 实现接收 Mini App 配置的 HTTP 端点
		// 这里暂时模拟默认配置
		time.Sleep(2 * time.Second)
		
		cfg.Database.Type = "sqlite"
		cfg.Database.SQLite.Path = "./data/hashpay.db"
		cfg.System.Currency = "CNY"
		cfg.System.Timeout = 1800
		cfg.System.FastConfirm = true
		cfg.System.RateAdjust = 0.00
		
		configChan <- cfg
	}()
	
	// 等待配置完成
	select {
	case config := <-configChan:
		fmt.Println("✅ 配置接收完成")
		return config
	case <-time.After(30 * time.Minute):
		// 超时使用默认配置
		fmt.Println("⚠️ 配置超时，使用默认设置")
		cfg.Database.Type = "sqlite"
		cfg.Database.SQLite.Path = "./data/hashpay.db"
		cfg.System.Currency = "CNY"
		cfg.System.Timeout = 1800
		cfg.System.FastConfirm = true
		cfg.System.RateAdjust = 0.00
		return cfg
	}
}

// 创建并初始化数据库
func createAndInitDB(cfg *Config) (*sql.DB, error) {
	var dsn string
	var driver string
	
	switch cfg.Database.Type {
	case "mysql":
		driver = "mysql"
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true",
			cfg.Database.MySQL.Username,
			cfg.Database.MySQL.Password,
			cfg.Database.MySQL.Host,
			cfg.Database.MySQL.Port,
			cfg.Database.MySQL.Database,
		)
	default:
		driver = "sqlite3"
		dsn = cfg.Database.SQLite.Path
		
		// 创建数据目录
		if err := os.MkdirAll("./data", 0755); err != nil {
			return nil, fmt.Errorf("创建数据目录失败: %w", err)
		}
	}
	
	// 连接数据库
	sqlDB, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}
	
	// 测试连接
	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}
	
	// 执行迁移
	if _, err := sqlDB.Exec(embeddedMigrationSQL); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("执行迁移失败: %w", err)
	}
	
	// 初始化默认配置
	db := &database.DB{}
	db.DB = sqlDB
	if driver != "" {
		db.SetDriver(driver)
	}
	
	configs := map[string]string{
		"currency":     cfg.System.Currency,
		"timeout":      fmt.Sprintf("%d", cfg.System.Timeout),
		"fast_confirm": fmt.Sprintf("%v", cfg.System.FastConfirm),
		"rate_adjust":  fmt.Sprintf("%.2f", cfg.System.RateAdjust),
	}
	
	for key, value := range configs {
		err := db.SetConfig(key, value)
		if err != nil {
			log.Printf("设置配置 %s 失败: %v", key, err)
		}
	}
	
	return sqlDB, nil
}

// 保存管理员
func saveAdmin(db *sql.DB, adminID int64) error {
	wrapper := &database.DB{}
	wrapper.DB = db
	now := time.Now().Unix()
	
	user := &database.User{
		TgID:      adminID,
		IsAdmin:   sql.NullInt64{Int64: 1, Valid: true},
		CreatedAt: now,
		UpdatedAt: now,
	}
	
	return wrapper.CreateUser(user)
}

// 保存配置文件
func saveConfig(cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}
	
	if err := ioutil.WriteFile("config.yaml", data, 0644); err != nil {
		return fmt.Errorf("保存配置文件失败: %w", err)
	}
	
	return nil
}

// 加载配置文件
func loadConfig() *Config {
	data, err := ioutil.ReadFile("config.yaml")
	if err != nil {
		log.Fatal("读取配置文件失败:", err)
	}
	
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		log.Fatal("解析配置文件失败:", err)
	}
	
	return &cfg
}

// 连接数据库
func connectDB(cfg *Config) (*sql.DB, error) {
	var dsn string
	var driver string
	
	switch cfg.Database.Type {
	case "mysql":
		driver = "mysql"
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true",
			cfg.Database.MySQL.Username,
			cfg.Database.MySQL.Password,
			cfg.Database.MySQL.Host,
			cfg.Database.MySQL.Port,
			cfg.Database.MySQL.Database,
		)
	default:
		driver = "sqlite3"
		dsn = cfg.Database.SQLite.Path
	}
	
	database, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}
	
	if err := database.Ping(); err != nil {
		database.Close()
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}
	
	return database, nil
}