package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"hashpay/internal/bot"
	"hashpay/internal/config"
	"hashpay/internal/handler"
	"hashpay/internal/model"
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
	cfg, needInit, err := loadConfig()
	if err != nil {
		return err
	}

	bootstrapHandler := handler.New(nil)
	if needInit {
		bootstrapHandler.Init.Enable(0)
	}

	// 先启动 Web 服务，初始化状态只影响业务服务可用性。
	srv := server.New(bootstrapHandler, &server.Config{
		AdminID:  cfg.Bot.Admin,
		BotToken: cfg.Bot.Token,
	})

	serverErrCh := make(chan error, 1)
	serverReadyCh := make(chan struct{}, 1)
	var serverReadyOnce sync.Once
	go func() {
		serverErrCh <- srv.Start(cfg.BindAddr(), func() {
			log.Success("HashPay 已启动，运行在 %s", cfg.BindAddr())
			serverReadyOnce.Do(func() {
				close(serverReadyCh)
			})
		})
	}()

	select {
	case err := <-serverErrCh:
		return err
	case <-serverReadyCh:
	}

	var cleanup func()
	var cleanupMu sync.Mutex
	defer func() {
		cleanupMu.Lock()
		defer cleanupMu.Unlock()
		if cleanup != nil {
			cleanup()
		}
	}()

	loadRuntime := func(runtimeCfg *config.Config) error {
		runtimeHandler, runtimeCleanup, loadErr := buildRuntime(runtimeCfg)
		if loadErr != nil {
			return loadErr
		}

		srv.SetHandler(runtimeHandler)

		cleanupMu.Lock()
		if cleanup != nil {
			cleanup()
		}
		cleanup = runtimeCleanup
		cleanupMu.Unlock()

		log.Success("业务服务已加载")
		return nil
	}

	if needInit {
		cfg, err = runSetup(cfg, bootstrapHandler, loadRuntime)
		if err != nil {
			return err
		}
	} else {
		if err := loadRuntime(cfg); err != nil {
			log.Warn("业务服务启动失败: %v", err)
		}
	}

	return <-serverErrCh
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
		Site:    service.NewSiteService(siteRepo),
	}
}

func buildRuntime(cfg *config.Config) (*handler.Handler, func(), error) {
	driver, dsn := cfg.DSN()
	db, err := repository.Open(driver, dsn)
	if err != nil {
		return nil, nil, err
	}

	if err := db.Migrate(); err != nil {
		log.Warn("数据库迁移: %v", err)
	}

	svc := createServices(db)
	h := handler.New(svc)
	txRepo := repository.NewTransactionRepo(db)

	scan := scanner.New(svc.Order, txRepo, 30*time.Second)
	payments, _ := svc.Payment.GetBlockchainPayments()

	tronAPIKey := ""
	for _, p := range payments {
		if strings.EqualFold(strings.TrimSpace(p.Chain), string(scanner.ChainTRON)) && strings.TrimSpace(p.APIKey) != "" {
			tronAPIKey = strings.TrimSpace(p.APIKey)
			break
		}
	}

	tronURL := "https://api.trongrid.io"
	ethRPC := "https://cloudflare-eth.com"
	bscRPC := "https://bsc-dataseed.binance.org"
	polygonRPC := "https://polygon-rpc.com"
	solanaRPC := "https://api.mainnet-beta.solana.com"
	tonURL := "https://toncenter.com/api/v2"
	if cfg.Debug {
		tronURL = "https://nile.trongrid.io"
		ethRPC = "https://rpc.sepolia.org"
		bscRPC = "https://data-seed-prebsc-1-s1.binance.org:8545"
		polygonRPC = "https://rpc-amoy.polygon.technology"
		solanaRPC = "https://api.devnet.solana.com"
		tonURL = "https://testnet.toncenter.com/api/v2"
		log.Info("DEBUG 模式已启用：链监听使用测试网")
	}

	ethAPI := scanner.NewEVMAPIWithNetwork(scanner.ChainETH, ethRPC, cfg.Debug)
	bscAPI := scanner.NewEVMAPIWithNetwork(scanner.ChainBSC, bscRPC, cfg.Debug)
	polygonAPI := scanner.NewEVMAPIWithNetwork(scanner.ChainPolygon, polygonRPC, cfg.Debug)

	scan.RegisterChain(scanner.NewTronAPI(tronURL, tronAPIKey))
	scan.RegisterChain(ethAPI)
	scan.RegisterChain(bscAPI)
	scan.RegisterChain(polygonAPI)
	scan.RegisterChain(scanner.NewEVMHubAPI(ethAPI, bscAPI, polygonAPI))
	scan.RegisterChain(scanner.NewSolanaAPI(solanaRPC))
	scan.RegisterChain(scanner.NewTonAPI(tonURL))

	var tgBot *bot.Bot
	if cfg.Bot.Token != "" {
		tgBot, err = bot.New(&bot.Config{
			Token:   cfg.Bot.Token,
			AdminID: cfg.Bot.Admin,
		}, &bot.Services{
			Users:    svc.User,
			Stats:    svc.Stats,
			Orders:   svc.Order,
			Payments: svc.Payment,
			Rates:    svc.Rate,
			Config:   svc.Config,
		})
		if err != nil {
			log.Warn("Bot 初始化失败: %v", err)
		} else {
			log.Success("Bot 初始化完成: @%s", tgBot.Username())
		}
	} else {
		log.Warn("未配置 Bot Token，已跳过 Bot 初始化")
	}

	if tgBot != nil {
		scan.OnConfirm(func(order model.Order, tx scanner.Transaction) {
			tgBot.NotifyOrderPaid(order.ID, tx.Hash)
			_ = tgBot.SendNotification(buildAdminPaidMessage(order, tx))
		})
	}

	scan.Start()
	if tgBot != nil {
		go tgBot.Start()
	}

	cleanup := func() {
		if tgBot != nil {
			tgBot.Stop()
		}
		scan.Stop()
		db.Close()
	}

	return h, cleanup, nil
}

// ensureDataDir 确保数据目录存在
func ensureDataDir(path string) error {
	dir := filepath.Dir(path)
	return os.MkdirAll(dir, 0755)
}

func buildAdminPaidMessage(order model.Order, tx scanner.Transaction) string {
	chain := paidChainLabel(tx.Chain)
	txCurrency := strings.ToUpper(strings.TrimSpace(tx.Currency))
	orderCurrency := strings.ToUpper(strings.TrimSpace(order.Currency))
	fromAddr := strings.TrimSpace(tx.From)
	if fromAddr == "" {
		fromAddr = "--"
	}
	toAddr := strings.TrimSpace(order.PayAddr)
	if toAddr == "" {
		toAddr = strings.TrimSpace(tx.To)
	}
	if toAddr == "" {
		toAddr = "--"
	}
	payTime := time.Now().Local().Format("2006-01-02 15:04:05")
	if tx.Timestamp > 0 {
		payTime = time.Unix(tx.Timestamp, 0).Local().Format("2006-01-02 15:04:05")
	}

	msg := fmt.Sprintf("✅ 收到付款 (%s %s)\n", chain, txCurrency)
	msg += fmt.Sprintf("订单号：%s\n", strings.TrimSpace(order.ID))
	msg += fmt.Sprintf("订单金额：%s%s\n", appFormatAmount(order.Amount), orderCurrency)
	msg += fmt.Sprintf("实收金额：%s%s\n", tx.Amount.String(), txCurrency)
	msg += fmt.Sprintf("付款地址：%s\n", fromAddr)
	msg += fmt.Sprintf("收款地址: %s\n", toAddr)
	msg += fmt.Sprintf("收款时间：%s\n", payTime)
	msg += fmt.Sprintf("交易哈希：%s", strings.TrimSpace(tx.Hash))
	return msg
}

func paidChainLabel(chain scanner.ChainType) string {
	switch chain {
	case scanner.ChainTRON:
		return "TRC20"
	case scanner.ChainETH:
		return "ERC20"
	case scanner.ChainBSC:
		return "BEP20"
	case scanner.ChainPolygon:
		return "POLYGON"
	case scanner.ChainSolana:
		return "SOLANA"
	case scanner.ChainTON:
		return "TON"
	default:
		return strings.ToUpper(strings.TrimSpace(string(chain)))
	}
}

func appFormatAmount(v float64) string {
	text := fmt.Sprintf("%.8f", v)
	text = strings.TrimRight(text, "0")
	text = strings.TrimRight(text, ".")
	if text == "" {
		return "0"
	}
	return text
}
