package app

import (
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"hashpay/internal/database"

	_ "github.com/mattn/go-sqlite3"
	"gopkg.in/yaml.v3"
)

// Config 表示应用的配置文件结构。
type Config struct {
	Bot struct {
		Token string `yaml:"token"`
		Admin int64  `yaml:"admin"`
	} `yaml:"bot"`
	Server struct {
		Bind string `yaml:"bind"`
	} `yaml:"server"`
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
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func saveConfig(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("保存配置文件失败: %w", err)
	}
	return nil
}

func connectDB(cfg *Config) (*sql.DB, error) {
	driver, dsn := dbParams(cfg)

	sqlDB, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}

	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}

	return sqlDB, nil
}

func createAndInitDB(cfg *Config) (*sql.DB, error) {
	driver, dsn := dbParams(cfg)

	if driver == "sqlite3" {
		if err := ensureDir(filepath.Dir(cfg.Database.SQLite.Path)); err != nil {
			return nil, fmt.Errorf("创建数据目录失败: %w", err)
		}
	}

	sqlDB, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}

	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}

	if _, err := sqlDB.Exec(database.EmbeddedInitSQL); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("执行迁移失败: %w", err)
	}

	db := &database.DB{}
	db.DB = sqlDB
	db.SetDriver(driver)

	configs := map[string]string{
		"currency":     cfg.System.Currency,
		"timeout":      fmt.Sprintf("%d", cfg.System.Timeout),
		"fast_confirm": fmt.Sprintf("%v", cfg.System.FastConfirm),
		"rate_adjust":  fmt.Sprintf("%.2f", cfg.System.RateAdjust),
	}

	for key, value := range configs {
		if err := db.SetConfig(key, value); err != nil {
			// 初始化阶段失败不终止流程，记录即可
			fmt.Printf("设置配置 %s 失败: %v\n", key, err)
		}
	}

	return sqlDB, nil
}

func saveAdmin(db *sql.DB, adminID int64, cfg *Config) error {
	wrapper := &database.DB{}
	wrapper.DB = db

	driver, _ := dbParams(cfg)
	wrapper.SetDriver(driver)

	if existingUser, err := wrapper.GetUser(adminID); err == nil && existingUser != nil {
		return nil
	}

	now := time.Now().Unix()
	user := &database.User{
		TgID:      adminID,
		IsAdmin:   sql.NullInt64{Int64: 1, Valid: true},
		CreatedAt: now,
		UpdatedAt: now,
	}

	return wrapper.CreateUser(user)
}

func dbParams(cfg *Config) (driver string, dsn string) {
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
	return
}

func ensureDir(path string) error {
	if path == "" || path == "." {
		return nil
	}
	return os.MkdirAll(path, fs.ModePerm)
}

// BindAddr 返回用于监听的地址，若未设置则使用默认值。
func (cfg *Config) BindAddr(defaultAddr string) string {
	if cfg == nil {
		return defaultAddr
	}
	if strings.TrimSpace(cfg.Server.Bind) != "" {
		return cfg.Server.Bind
	}
	return defaultAddr
}

// HasDatabase 判断配置中是否包含有效的数据库配置。
func (cfg *Config) HasDatabase() bool {
	if cfg == nil {
		return false
	}

	switch strings.ToLower(strings.TrimSpace(cfg.Database.Type)) {
	case "sqlite":
		return strings.TrimSpace(cfg.Database.SQLite.Path) != ""
	case "mysql":
		mysql := cfg.Database.MySQL
		return strings.TrimSpace(mysql.Host) != "" &&
			mysql.Port != 0 &&
			strings.TrimSpace(mysql.Database) != "" &&
			strings.TrimSpace(mysql.Username) != ""
	default:
		return false
	}
}
