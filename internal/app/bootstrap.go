package app

import (
	"os"
	"path/filepath"
	"time"

	"hashpay/internal/bot"
	"hashpay/internal/config"
	"hashpay/internal/handler"
	"hashpay/internal/pkg/log"
	"hashpay/internal/repository"
	"hashpay/internal/scanner"
	"hashpay/internal/server"
	"hashpay/internal/service"
)

const Version = "0.0.1"

type App struct {
	Config  *config.Config
	DB      *repository.DB
	Server  *server.Server
	Handler *handler.Handler
}

func Run() error {
	log.Banner(Version)

	// 加载配置，判断是否需要初始化
	cfg, init, err := loadConfig()
	if err != nil {
		return err
	}

	var setupServer *server.Server
	var setupHandler *handler.Handler
	startInitServer := func() {
		if setupServer != nil {
			return
		}
		setupHandler = handler.New(nil)
		setupServer = server.New(setupHandler, &server.Config{InitOnly: true})
		go func() {
			if err := setupServer.Start(cfg.BindAddr()); err != nil {
				log.Error("初始化服务器启动失败: %v", err)
			}
		}()
		log.Info("初始化服务已启动: %s", cfg.BindAddr())
		log.Info("请确保公网地址可访问到该服务，稍后会通过 /health 进行验证")
	}
	stopInitServer := func() {
		if setupServer == nil {
			return
		}
		if err := setupServer.Stop(); err != nil {
			log.Warn("初始化服务器关闭失败: %v", err)
		}
		setupServer = nil
	}

	// 需要初始化
	if init {
		startInitServer()
		cfg, err = runSetup(cfg, setupHandler)
		if err != nil {
			stopInitServer()
			return err
		}
		log.Info("初始化服务运行中，请完成配置后重启服务")
		select {}
	}

	// 连接数据库（若连接失败，进入初始化流程）
	driver, dsn := cfg.DSN()
	db, err := repository.Open(driver, dsn)
	if err != nil {
		if init {
			return err
		}
		log.Warn("连接数据库失败，进入初始化流程: %v", err)
		startInitServer()
		cfg, err = runSetup(cfg, setupHandler)
		if err != nil {
			stopInitServer()
			return err
		}
		log.Info("初始化服务运行中，请完成配置后重启服务")
		select {}
	}
	defer db.Close()

	// 执行迁移
	if err := db.Migrate(); err != nil {
		log.Warn("数据库迁移: %v", err)
	}

	// 创建服务
	svc := createServices(db)

	// 创建 Handler
	h := handler.New(svc)

	// 创建并启动 Server
	srv := server.New(h, &server.Config{
		AdminID: cfg.Bot.Admin,
	})

	// 创建扫描器
	scan := scanner.New(svc.Order, 30*time.Second)

	// 注册已配置的链
	payments, _ := svc.Payment.GetBlockchainPayments()
	for _, p := range payments {
		switch scanner.ChainType(p.Chain) {
		case scanner.ChainTRON:
			scan.RegisterChain(scanner.NewTronAPI("https://api.trongrid.io", p.APIKey))
		case scanner.ChainBSC:
			scan.RegisterChain(scanner.NewBSCAPI("https://api.bscscan.com", p.APIKey))
		}
	}

	// 创建 Bot（可选）
	var tgBot *bot.Bot
	if cfg.Bot.Token != "" {
		var err error
		tgBot, err = bot.New(&bot.Config{
			Token:   cfg.Bot.Token,
			AdminID: cfg.Bot.Admin,
		}, &bot.Services{
			Users: svc.User,
			Stats: svc.Stats,
		})
		if err != nil {
			log.Warn("Bot 初始化失败: %v", err)
		}
	}

	// 设置扫描器回调
	if tgBot != nil {
		scan.OnConfirm(func(orderID, txHash string) {
			tgBot.SendNotification("✅ 订单 " + orderID + " 已确认\n交易: " + txHash)
		})
	}

	// 启动服务
	scan.Start()
	defer scan.Stop()

	if tgBot != nil {
		go tgBot.Start()
		defer tgBot.Stop()
	}

	log.Success("HashPay 启动成功")
	log.Info("访问地址: http://localhost%s", cfg.BindAddr())

	return srv.Start(cfg.BindAddr())
}

func loadConfig() (*config.Config, bool, error) {
	if !config.Exists(config.ConfigPath) {
		return &config.Config{}, true, nil
	}

	cfg, err := config.Load(config.ConfigPath)
	if err != nil {
		return nil, false, err
	}

	// 检查是否需要初始化
	if cfg.Bot.Token == "" || !cfg.HasDatabase() {
		return cfg, true, nil
	}

	return cfg, false, nil
}

func createServices(db *repository.DB) *handler.Services {
	// 创建 Repository
	orderRepo := repository.NewOrderRepo(db)
	paymentRepo := repository.NewPaymentRepo(db)
	userRepo := repository.NewUserRepo(db)
	configRepo := repository.NewConfigRepo(db)
	siteRepo := repository.NewSiteRepo(db)

	// 创建 Service
	return &handler.Services{
		Order:   service.NewOrderService(orderRepo, siteRepo, configRepo),
		Payment: service.NewPaymentService(paymentRepo),
		Rate:    service.NewRateService(configRepo),
		Stats:   service.NewStatsService(orderRepo),
		User:    service.NewUserService(userRepo),
		Config:  service.NewConfigService(configRepo),
	}
}

// ensureDataDir 确保数据目录存在
func ensureDataDir(path string) error {
	dir := filepath.Dir(path)
	return os.MkdirAll(dir, 0755)
}
