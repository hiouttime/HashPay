package log

import (
	"fmt"
	"os"
	"time"

	"github.com/fatih/color"
)

var (
	infoColor    = color.New(color.FgCyan)
	successColor = color.New(color.FgGreen)
	warnColor    = color.New(color.FgYellow)
	errorColor   = color.New(color.FgRed)
	debugColor   = color.New(color.FgMagenta)
)

func timestamp() string {
	return time.Now().Format("15:04:05")
}

func Info(format string, args ...any) {
	infoColor.Printf("[%s] INFO  ", timestamp())
	fmt.Printf(format+"\n", args...)
}

func Success(format string, args ...any) {
	successColor.Printf("[%s] OK    ", timestamp())
	fmt.Printf(format+"\n", args...)
}

func Warn(format string, args ...any) {
	warnColor.Printf("[%s] WARN  ", timestamp())
	fmt.Printf(format+"\n", args...)
}

func Error(format string, args ...any) {
	errorColor.Printf("[%s] ERROR ", timestamp())
	fmt.Printf(format+"\n", args...)
}

func Debug(format string, args ...any) {
	if os.Getenv("DEBUG") != "" {
		debugColor.Printf("[%s] DEBUG ", timestamp())
		fmt.Printf(format+"\n", args...)
	}
}

func Fatal(format string, args ...any) {
	errorColor.Printf("[%s] FATAL ", timestamp())
	fmt.Printf(format+"\n", args...)
	os.Exit(1)
}

// Banner 打印启动横幅
func Banner(version string) {
	fmt.Println()
	color.New(color.FgHiCyan, color.Bold).Println("  ██╗  ██╗ █████╗ ███████╗██╗  ██╗██████╗  █████╗ ██╗   ██╗")
	color.New(color.FgHiCyan, color.Bold).Println("  ██║  ██║██╔══██╗██╔════╝██║  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝")
	color.New(color.FgHiCyan, color.Bold).Println("  ███████║███████║███████╗███████║██████╔╝███████║ ╚████╔╝ ")
	color.New(color.FgHiCyan, color.Bold).Println("  ██╔══██║██╔══██║╚════██║██╔══██║██╔═══╝ ██╔══██║  ╚██╔╝  ")
	color.New(color.FgHiCyan, color.Bold).Println("  ██║  ██║██║  ██║███████║██║  ██║██║     ██║  ██║   ██║   ")
	color.New(color.FgHiCyan, color.Bold).Println("  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝   ╚═╝   ")
	fmt.Println()
	color.New(color.FgWhite).Printf("  Made with ❤️ by TGDash Team. Version %s\n\n", version)
}
