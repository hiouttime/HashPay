package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
)

func sign(values map[string]string, secret string) string {
	mac := hmac.New(sha256.New, []byte(strings.TrimSpace(secret)))
	mac.Write([]byte(canonical(values)))
	return hex.EncodeToString(mac.Sum(nil))
}

func verifySign(values map[string]string, secret, got string) bool {
	expected := sign(values, secret)
	return hmac.Equal([]byte(strings.ToLower(expected)), []byte(strings.ToLower(strings.TrimSpace(got))))
}

func canonical(values map[string]string) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		if strings.TrimSpace(key) == "" || key == "sign" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+strings.TrimSpace(values[key]))
	}
	return strings.Join(parts, "&")
}
