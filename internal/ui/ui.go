package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/fatih/color"
)

var (
	timeStyle    = color.New(color.Faint)
	infoStyle    = color.New(color.FgCyan, color.Bold)
	successStyle = color.New(color.FgGreen, color.Bold)
	warnStyle    = color.New(color.FgYellow, color.Bold)
	errorStyle   = color.New(color.FgRed, color.Bold)
	debugStyle   = color.New(color.FgMagenta, color.Bold)
	actionStyle  = color.New(color.FgBlue, color.Bold)
	textStyle    = color.New(color.FgWhite)
	titleStyle   = color.New(color.FgWhite, color.Bold)
	bannerStyle  = color.New(color.FgMagenta, color.Bold)
)

const bannerArt = ` _   _           _     ____             
| | | | __ _ ___| |__ |  _ \ __ _ _   _ 
| |_| |/ _' / __| '_ \| |_) / _' | | | |
|  _  | (_| \__ \ | | |  __/ (_| | |_| |
|_| |_|\__,_|___/_| |_|_|   \__,_|\__, |  
                                  |___/ `

func logLine(style *color.Color, icon, format string, args ...any) {
	message := strings.TrimSpace(fmt.Sprintf(format, args...))
	timestamp := time.Now().Format("15:04:05")
	fmt.Printf("%s %s\n",
		timeStyle.Sprintf("[%s]", timestamp),
		style.Sprintf("%s %s", icon, message),
	)
}

func Info(format string, args ...any) {
	logLine(infoStyle, "[INFO] ", format, args...)
}

func Success(format string, args ...any) {
	logLine(successStyle, "✅", format, args...)
}

func Warn(format string, args ...any) {
	logLine(warnStyle, "[WARNING] ", format, args...)
}

func Error(format string, args ...any) {
	logLine(errorStyle, "❌", format, args...)
}

func Debug(format string, args ...any) {
	logLine(debugStyle, "[DEBUG]", format, args...)
}

func Action(format string, args ...any) {
	logLine(actionStyle, "🚀", format, args...)
}

func Banner(version string) {
	fmt.Print(bannerStyle.Sprint(bannerArt))
	if strings.TrimSpace(version) != "" {
		fmt.Println(" Version ", version)
	}
	fmt.Println(successStyle.Sprintf("© TGDash Team. All rights reserved."))
	fmt.Println()
}

func Title(format string, args ...any) {
	fmt.Println(titleStyle.Sprintf(format, args...))
}

func Text(format string, args ...any) {
	fmt.Println(textStyle.Sprintf(format, args...))
}

func Bullet(lines ...string) {
	bullet := infoStyle.Sprint("•")
	for _, line := range lines {
		fmt.Printf("  %s %s\n", bullet, textStyle.Sprintf("%s", line))
	}
}

func Spacer() {
	fmt.Println()
}
