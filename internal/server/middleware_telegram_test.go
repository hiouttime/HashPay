package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
)

func TestTelegramAuthSuccess(t *testing.T) {
	app := fiber.New()
	app.Get("/admin", telegramAuth(1001, "123456:ABCDEF"), func(c fiber.Ctx) error {
		return c.SendStatus(http.StatusOK)
	})

	req, _ := http.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-Tg-Init-Data", buildSignedInitData("123456:ABCDEF", 1001, time.Now().Unix()))

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("状态码错误: got=%d want=200", resp.StatusCode)
	}
}

func TestTelegramAuthMissingHeader(t *testing.T) {
	app := fiber.New()
	app.Get("/admin", telegramAuth(1001, "123456:ABCDEF"), func(c fiber.Ctx) error {
		return c.SendStatus(http.StatusOK)
	})

	req, _ := http.NewRequest(http.MethodGet, "/admin", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("状态码错误: got=%d want=401", resp.StatusCode)
	}
}

func TestTelegramAuthInvalidHash(t *testing.T) {
	app := fiber.New()
	app.Get("/admin", telegramAuth(1001, "123456:ABCDEF"), func(c fiber.Ctx) error {
		return c.SendStatus(http.StatusOK)
	})

	initData := buildSignedInitData("123456:ABCDEF", 1001, time.Now().Unix())
	req, _ := http.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-Tg-Init-Data", initData+"x")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("状态码错误: got=%d want=401", resp.StatusCode)
	}
}

func TestTelegramAuthForbiddenNonAdmin(t *testing.T) {
	app := fiber.New()
	app.Get("/admin", telegramAuth(1001, "123456:ABCDEF"), func(c fiber.Ctx) error {
		return c.SendStatus(http.StatusOK)
	})

	req, _ := http.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-Tg-Init-Data", buildSignedInitData("123456:ABCDEF", 2002, time.Now().Unix()))

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("状态码错误: got=%d want=403", resp.StatusCode)
	}
}

func TestTelegramAuthExpired(t *testing.T) {
	app := fiber.New()
	app.Get("/admin", telegramAuth(1001, "123456:ABCDEF"), func(c fiber.Ctx) error {
		return c.SendStatus(http.StatusOK)
	})

	expired := time.Now().Add(-25 * time.Hour).Unix()
	req, _ := http.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-Tg-Init-Data", buildSignedInitData("123456:ABCDEF", 1001, expired))

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("状态码错误: got=%d want=401", resp.StatusCode)
	}
}

func buildSignedInitData(botToken string, userID int64, authDate int64) string {
	values := url.Values{}
	values.Set("auth_date", fmt.Sprintf("%d", authDate))
	values.Set("query_id", "AAEAAAE")
	values.Set("user", fmt.Sprintf(`{"id":%d,"first_name":"Admin"}`, userID))

	pairs := make([]string, 0, len(values))
	for key, items := range values {
		pairs = append(pairs, key+"="+items[0])
	}
	sort.Strings(pairs)
	dataCheckString := strings.Join(pairs, "\n")

	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	secretMAC.Write([]byte(botToken))
	secret := secretMAC.Sum(nil)

	checkMAC := hmac.New(sha256.New, secret)
	checkMAC.Write([]byte(dataCheckString))
	values.Set("hash", hex.EncodeToString(checkMAC.Sum(nil)))

	return values.Encode()
}
