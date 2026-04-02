package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Bot      BotConfig      `yaml:"bot"`
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Debug    bool           `yaml:"DEBUG"`
}

type BotConfig struct {
	Token string `yaml:"token"`
	Admin int64  `yaml:"admin"`
}

type ServerConfig struct {
	Bind   string `yaml:"bind"`
	Public string `yaml:"public"`
}

type DatabaseConfig struct {
	Type   string       `yaml:"type"`
	SQLite SQLiteConfig `yaml:"sqlite"`
	MySQL  MySQLConfig  `yaml:"mysql"`
}

type SQLiteConfig struct {
	Path string `yaml:"path"`
}

type MySQLConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Database string `yaml:"database"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

const ConfigPath = "config.yaml"

// Load 从文件加载配置
func Load(path string) (*Config, error) {
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

// Save 保存配置到文件
func Save(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// Exists 检查配置文件是否存在
func Exists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// BindAddr 返回服务器绑定地址
func (c *Config) BindAddr() string {
	if c.Server.Bind != "" {
		return c.Server.Bind
	}
	return ":8181"
}

// HasDatabase 检查是否配置了数据库
func (c *Config) HasDatabase() bool {
	switch c.Database.Type {
	case "sqlite":
		return c.Database.SQLite.Path != ""
	case "mysql":
		return c.Database.MySQL.Host != "" && c.Database.MySQL.Database != ""
	}
	return false
}

// DSN 返回数据库连接字符串
func (c *Config) DSN() (driver, dsn string) {
	switch c.Database.Type {
	case "mysql":
		driver = "mysql"
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true",
			c.Database.MySQL.Username,
			c.Database.MySQL.Password,
			c.Database.MySQL.Host,
			c.Database.MySQL.Port,
			c.Database.MySQL.Database,
		)
	default:
		driver = "sqlite3"
		dsn = c.Database.SQLite.Path
		if dsn == "" {
			dsn = "./data/hashpay.db"
		}
	}
	return
}
