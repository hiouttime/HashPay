package utils

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

var logger *slog.Logger

type LogConfig struct {
	Level      string
	OutputPath string
	MaxSize    int64
	MaxAge     int
	Console    bool
}

func InitLogger(cfg *LogConfig) error {
	var level slog.Level
	switch cfg.Level {
	case "debug":
		level = slog.LevelDebug
	case "info":
		level = slog.LevelInfo
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	
	opts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				return slog.String(slog.TimeKey, time.Now().Format("2006-01-02 15:04:05.000"))
			}
			if a.Key == slog.SourceKey {
				source := a.Value.Any().(*slog.Source)
				return slog.String("source", fmt.Sprintf("%s:%d", filepath.Base(source.File), source.Line))
			}
			return a
		},
		AddSource: true,
	}
	
	var writers []io.Writer
	
	// 控制台输出
	if cfg.Console {
		writers = append(writers, os.Stdout)
	}
	
	// 文件输出
	if cfg.OutputPath != "" {
		file, err := openLogFile(cfg.OutputPath)
		if err != nil {
			return fmt.Errorf("open log file: %w", err)
		}
		writers = append(writers, file)
		
		// 启动日志轮转
		go rotateLog(cfg)
	}
	
	var handler slog.Handler
	if len(writers) > 0 {
		writer := io.MultiWriter(writers...)
		handler = slog.NewJSONHandler(writer, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}
	
	logger = slog.New(handler)
	slog.SetDefault(logger)
	
	return nil
}

func openLogFile(path string) (*os.File, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	
	return os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
}

func rotateLog(cfg *LogConfig) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	
	for range ticker.C {
		rotateLogFile(cfg)
	}
}

func rotateLogFile(cfg *LogConfig) {
	if cfg.OutputPath == "" {
		return
	}
	
	// 检查文件大小
	info, err := os.Stat(cfg.OutputPath)
	if err != nil {
		return
	}
	
	if info.Size() < cfg.MaxSize {
		return
	}
	
	// 重命名旧文件
	timestamp := time.Now().Format("20060102_150405")
	newPath := fmt.Sprintf("%s.%s", cfg.OutputPath, timestamp)
	
	if err := os.Rename(cfg.OutputPath, newPath); err != nil {
		Error("Failed to rotate log file", "error", err)
		return
	}
	
	// 清理旧日志
	cleanOldLogs(cfg)
}

func cleanOldLogs(cfg *LogConfig) {
	if cfg.MaxAge <= 0 {
		return
	}
	
	dir := filepath.Dir(cfg.OutputPath)
	base := filepath.Base(cfg.OutputPath)
	
	cutoff := time.Now().AddDate(0, 0, -cfg.MaxAge)
	
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		
		if filepath.Base(path) == base || !info.Mode().IsRegular() {
			return nil
		}
		
		if info.ModTime().Before(cutoff) {
			os.Remove(path)
		}
		
		return nil
	})
}

func Debug(msg string, args ...any) {
	if logger != nil {
		logger.Debug(msg, args...)
	}
}

func Info(msg string, args ...any) {
	if logger != nil {
		logger.Info(msg, args...)
	}
}

func Warn(msg string, args ...any) {
	if logger != nil {
		logger.Warn(msg, args...)
	}
}

func Error(msg string, args ...any) {
	if logger != nil {
		logger.Error(msg, args...)
	}
}

func Fatal(msg string, args ...any) {
	if logger != nil {
		logger.Error(msg, args...)
		os.Exit(1)
	}
}

func WithError(err error) slog.Attr {
	return slog.Any("error", err)
}

func WithField(key string, value any) slog.Attr {
	return slog.Any(key, value)
}

func GetLogger() *slog.Logger {
	if logger == nil {
		return slog.Default()
	}
	return logger
}

// 请求日志中间件
func LogRequest(method, path string, status int, duration time.Duration) {
	Info("HTTP Request",
		"method", method,
		"path", path,
		"status", status,
		"duration", duration.Milliseconds(),
	)
}

// 错误恢复
func RecoverPanic() {
	if r := recover(); r != nil {
		buf := make([]byte, 4096)
		n := runtime.Stack(buf, false)
		Error("Panic recovered",
			"panic", r,
			"stack", string(buf[:n]),
		)
	}
}