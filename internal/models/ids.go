package models

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

func newID(prefix string, size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return prefix + strings.ToUpper(hex.EncodeToString(buf)), nil
}

func newOrderID() string {
	id, err := newID("", 8)
	if err != nil {
		return fmt.Sprintf("HP%d", time.Now().UnixNano())
	}
	return id
}

func newRouteID() string {
	id, err := newID("RT", 6)
	if err != nil {
		return fmt.Sprintf("RT%d", time.Now().UnixNano())
	}
	return id
}
