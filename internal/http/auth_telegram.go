package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
)

func (s *Server) telegramAuth() fiber.Handler {
	return func(c fiber.Ctx) error {
		initData := strings.TrimSpace(c.Get("X-Tg-Init-Data"))
		if initData == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "缺少 Telegram 鉴权")
		}
		userID, err := validateTelegram(initData, s.config.BotToken())
		if err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Telegram 鉴权失败")
		}
		if userID == 0 || userID != s.config.AdminID() {
			return fiber.NewError(fiber.StatusForbidden, "无权访问")
		}
		c.Locals("tg_id", userID)
		return c.Next()
	}
}

func validateTelegram(initData, botToken string) (int64, error) {
	values, err := url.ParseQuery(initData)
	if err != nil {
		return 0, err
	}
	hashValue := values.Get("hash")
	if hashValue == "" {
		return 0, fmt.Errorf("missing hash")
	}
	values.Del("hash")

	pairs := make([]string, 0, len(values))
	for key, items := range values {
		if len(items) == 0 {
			continue
		}
		pairs = append(pairs, key+"="+items[0])
	}
	sort.Strings(pairs)
	dataCheckString := strings.Join(pairs, "\n")

	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	secretMAC.Write([]byte(botToken))
	secret := secretMAC.Sum(nil)

	checkMAC := hmac.New(sha256.New, secret)
	checkMAC.Write([]byte(dataCheckString))
	expected := hex.EncodeToString(checkMAC.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(hashValue)) {
		return 0, fmt.Errorf("bad hash")
	}

	authDate, _ := strconv.ParseInt(values.Get("auth_date"), 10, 64)
	if time.Since(time.Unix(authDate, 0)) > 24*time.Hour {
		return 0, fmt.Errorf("expired")
	}

	var user struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal([]byte(values.Get("user")), &user); err != nil {
		return 0, err
	}
	return user.ID, nil
}
