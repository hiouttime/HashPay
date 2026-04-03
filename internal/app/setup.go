package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	cfgpkg "hashpay/internal/config"
	httpapi "hashpay/internal/http"
	"hashpay/internal/jobs"
	"hashpay/internal/service"
	"hashpay/internal/utils/log"

	"github.com/manifoldco/promptui"
	tele "gopkg.in/telebot.v4"
)

const installLockPath = "./data/install.lock"

var ErrInterrupted = errors.New("interrupted")

func runPrompt(prompt promptui.Prompt) (string, error) {
	value, err := prompt.Run()
	if err == nil {
		return value, nil
	}
	if errors.Is(err, promptui.ErrInterrupt) || errors.Is(err, promptui.ErrEOF) {
		return "", ErrInterrupted
	}
	return "", err
}

func promptSetup() (string, string, error) {
	log.Success("欢迎使用 HashPay！")
	log.Info("让我们来完成一些基础配置：\n")

	publicURL, err := inputPublicURL()
	if err != nil {
		return "", "", err
	}
	token, err := inputBotToken()
	if err != nil {
		return "", "", err
	}
	return publicURL, token, nil
}

func inputPublicURL() (string, error) {
	log.Info("你可以通过内网穿透、反向代理等方式将 Web 服务暴露在公网。地址必须为 HTTPS 协议。")
	for {
		value, err := runPrompt(promptui.Prompt{
			Label: "公网访问地址",
			Validate: func(input string) error {
				_, err := validateURL(input)
				return err
			},
		})
		if err != nil {
			return "", err
		}
		publicURL, _ := validateURL(value)
		if err := verifyPublicURL(publicURL); err != nil {
			log.Warn(err.Error())
			continue
		}
		return publicURL, nil
	}
}

func inputBotToken() (string, error) {
	log.Info("如果你还没有机器人，你需要在 Telegram @BotFather 创建一个新的机器人，并获取它的 Bot Token。")
	for {
		value, err := runPrompt(promptui.Prompt{
			Label: "Bot Token",
			Mask:  '*',
			Validate: func(input string) error {
				token := strings.TrimSpace(input)
				if token == "" {
					return fmt.Errorf("Bot Token 不能为空")
				}
				parts := strings.SplitN(token, ":", 2)
				if len(parts) != 2 {
					return fmt.Errorf("Bot Token 格式不正确")
				}
				return nil
			},
		})
		if err != nil {
			return "", err
		}
		token := strings.TrimSpace(value)
		username, err := verifyBotToken(token)
		if err != nil {
			log.Warn(err.Error())
			continue
		}
		log.Success("已配置 @%s", username)
		return token, nil
	}
}

func validateURL(raw string) (string, error) {
	raw = strings.TrimRight(strings.TrimSpace(raw), "/")
	if raw == "" {
		return "", fmt.Errorf("地址不能为空")
	}
	target, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("地址无效")
	}
	if target.Scheme != "https" {
		return "", fmt.Errorf("地址必须使用 HTTPS")
	}
	if target.Host == "" {
		return "", fmt.Errorf("地址不正确")
	}
	return raw, nil
}

func verifyPublicURL(raw string) error {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(raw + "/health")
	if err != nil {
		return fmt.Errorf("公网地址无法访问当前服务，请检查域名解析、证书或反向代理")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("检查地址异常: %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if err != nil {
		return fmt.Errorf("读取检查结果失败")
	}
	var data struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(body, &data); err != nil || strings.TrimSpace(data.Status) != "ok" {
		return fmt.Errorf("公网地址未指向当前服务")
	}
	return nil
}

func verifyBotToken(token string) (string, error) {
	if token == "" {
		return "", fmt.Errorf("Bot Token 不能为空")
	}
	parts := strings.SplitN(token, ":", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("Bot Token 格式不正确")
	}
	b, err := tele.NewBot(tele.Settings{
		Token:  token,
		Poller: &tele.LongPoller{Timeout: time.Second},
	})
	if err != nil {
		return "", fmt.Errorf("验证失败: %v", err)
	}
	if b.Me == nil || strings.TrimSpace(b.Me.Username) == "" {
		return "", fmt.Errorf("无法读取机器人信息，请检查 Bot Token 是否正确")
	}
	return b.Me.Username, nil
}

func saveConfig(config *cfgpkg.Config) error {
	if err := ensureDataPath(config.Database.SQLite.Path); err != nil {
		return err
	}
	return cfgpkg.Save(cfgpkg.ConfigPath, config)
}

func (s *state) SetDB(req httpapi.DBConfig) (string, error) {
	cfg := *s.cfg
	db := req.Database
	cfg.Database = cfgpkg.DatabaseConfig{
		Type: strings.TrimSpace(db.Type),
		SQLite: cfgpkg.SQLiteConfig{
			Path: strings.TrimSpace(db.SQLite.Path),
		},
		MySQL: cfgpkg.MySQLConfig{
			Host:     strings.TrimSpace(db.MySQL.Host),
			Port:     db.MySQL.Port,
			Database: strings.TrimSpace(db.MySQL.Database),
			Username: strings.TrimSpace(db.MySQL.Username),
			Password: db.MySQL.Password,
		},
	}
	if cfg.Database.Type == "" {
		if cfg.Database.MySQL.Host != "" && cfg.Database.MySQL.Database != "" {
			cfg.Database.Type = "mysql"
		} else {
			cfg.Database.Type = "sqlite"
		}
	}
	if cfg.Database.Type == "mysql" {
		cfg.Database.SQLite.Path = ""
		if cfg.Database.MySQL.Port == 0 {
			cfg.Database.MySQL.Port = 3306
		}
	} else {
		cfg.Database.Type = "sqlite"
		cfg.Database.MySQL = cfgpkg.MySQLConfig{}
		if cfg.Database.SQLite.Path == "" {
			cfg.Database.SQLite.Path = "./data/hashpay.db"
		}
	}
	repo, err := openDB(&cfg)
	if err != nil {
		return "", fmt.Errorf("数据库连接或迁移失败")
	}
	if err := saveConfig(&cfg); err != nil {
		_ = repo.Close()
		return "", fmt.Errorf("保存配置失败")
	}

	oldDB := s.db
	if s.jobs != nil {
		s.jobs.Stop()
	}
	app := service.New(repo)
	s.cfg = &cfg
	s.db = repo
	s.app = app
	s.web.SetRuntime(&httpapi.Runtime{App: app})
	s.jobs = jobs.New(repo, app, cfg.Debug, s.bot)
	s.jobs.Start()
	if oldDB != nil {
		_ = oldDB.Close()
	}
	if err := installLock(); err != nil {
		return "", fmt.Errorf("安装状态写入失败")
	}
	return "数据库已连接并完成迁移，系统已启动。", nil
}

func installDone() bool {
	info, err := os.Stat(installLockPath)
	return err == nil && !info.IsDir()
}

func installLock() error {
	if err := ensureDataPath(installLockPath); err != nil {
		return err
	}
	return os.WriteFile(installLockPath, []byte("installed\n"), 0o644)
}

func ensureDataPath(path string) error {
	dir := filepath.Dir(path)
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}
