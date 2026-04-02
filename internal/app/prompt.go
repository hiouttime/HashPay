package app

import (
	"errors"

	"github.com/manifoldco/promptui"
)

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
