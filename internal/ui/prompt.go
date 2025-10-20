package ui

import (
	"strings"

	"github.com/fatih/color"
	"github.com/manifoldco/promptui"
)

// textPrompt 构造一个带有统一样式的 prompt。
func textPrompt(label string, mask rune, validate promptui.ValidateFunc) *promptui.Prompt {
	labelStyle := color.New(color.FgYellow, color.Bold)
	prompt := &promptui.Prompt{
		Label:    labelStyle.Sprintf("❓ %s", label),
		Mask:     mask,
		Validate: validate,
	}

	return prompt
}

func PromptText(label string, validate promptui.ValidateFunc) (string, error) {
	prompt := textPrompt(label, 0, validate)
	value, err := prompt.Run()
	return strings.TrimSpace(value), err
}

func PromptSecret(label string, validate promptui.ValidateFunc) (string, error) {
	prompt := textPrompt(label, '*', validate)
	value, err := prompt.Run()
	return strings.TrimSpace(value), err
}
