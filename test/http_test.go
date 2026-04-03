package test

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	httpapi "hashpay/internal/http"
	"hashpay/internal/models"
	"hashpay/internal/service"
)

func testServer(t *testing.T) *httpapi.Server {
	t.Helper()
	db, err := models.Open("sqlite3", filepath.Join(t.TempDir(), "http-test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.Migrate(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	app := service.New(models.New(db))
	srv := httpapi.New(httpapi.Config{
		Installed: func() bool { return false },
		BotToken:  func() string { return "test-token" },
		AdminID:   func() int64 { return 1 },
		SetDB: func(req httpapi.DBConfig) (string, error) {
			return "ok", nil
		},
	})
	srv.SetRuntime(&httpapi.Runtime{App: app})
	return srv
}

func TestAppRedirectsToSetupWhenNotInstalled(t *testing.T) {
	srv := httpapi.New(httpapi.Config{
		Installed: func() bool { return false },
		BotToken:  func() string { return "test-token" },
		AdminID:   func() int64 { return 1 },
		SetDB: func(req httpapi.DBConfig) (string, error) {
			return "ok", nil
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/app", nil)
	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("app request: %v", err)
	}
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("unexpected status: %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Location"); got != "/app/setup" {
		t.Fatalf("unexpected location: %s", got)
	}
}

func TestAdminRouteRequiresRuntime(t *testing.T) {
	srv := httpapi.New(httpapi.Config{
		Installed: func() bool { return false },
		BotToken:  func() string { return "test-token" },
		AdminID:   func() int64 { return 1 },
		SetDB: func(req httpapi.DBConfig) (string, error) {
			return "ok", nil
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("admin request: %v", err)
	}
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("unexpected status: %d", resp.StatusCode)
	}
}

func TestCheckoutRouteRegistered(t *testing.T) {
	srv := testServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/checkout/missing-order", nil)
	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("checkout request: %v", err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unexpected status: %d", resp.StatusCode)
	}
}
