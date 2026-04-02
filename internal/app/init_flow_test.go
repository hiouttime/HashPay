package app

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"hashpay/internal/config"
	"hashpay/internal/handler"
	"hashpay/internal/server"
)

type initStatusResponse struct {
	Status  string `json:"status"`
	AdminID int64  `json:"admin_id"`
}

type initSubmitResponse struct {
	Status  string `json:"status"`
	Ready   bool   `json:"ready"`
	Message string `json:"message"`
	Error   string `json:"error"`
	Code    int    `json:"code"`
}

func TestInitFlowSuccess(t *testing.T) {
	tmpDir := t.TempDir()
	originalWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("读取工作目录失败: %v", err)
	}
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("切换工作目录失败: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(originalWD)
	})

	cfg := &config.Config{
		Bot: config.BotConfig{
			Admin: 9527,
		},
		Server: config.ServerConfig{
			Public: "https://pay.example.com",
		},
	}

	h := handler.New(nil)
	h.Init.Enable(cfg.Bot.Admin)

	runtimeLoaded := false
	registerInitConfigHandler(h, cfg, func(runtimeCfg *config.Config) error {
		runtimeLoaded = runtimeCfg == cfg
		return nil
	})

	srv := server.New(h, &server.Config{AdminID: cfg.Bot.Admin})

	statusBefore, respCode := queryStatus(t, srv, "/api/status")
	if respCode != http.StatusOK {
		t.Fatalf("初始化前状态码错误: got=%d want=200", respCode)
	}
	if statusBefore.Status != "init" || statusBefore.AdminID != cfg.Bot.Admin {
		t.Fatalf("初始化前状态错误: %+v", statusBefore)
	}

	optionsResp := requestJSON(t, srv, http.MethodOptions, "/api/config", nil)
	if optionsResp.status != http.StatusNoContent {
		t.Fatalf("OPTIONS /api/config 状态码错误: got=%d want=204", optionsResp.status)
	}

	payload := map[string]any{
		"database": map[string]any{
			"type": "sqlite",
			"mysql": map[string]any{
				"host":     "",
				"port":     3306,
				"database": "",
				"username": "",
				"password": "",
			},
		},
		"system": map[string]any{
			"currency":     "CNY",
			"timeout":      1800,
			"fast_confirm": true,
			"rate_adjust":  0,
		},
	}

	submitResp := requestJSON(t, srv, http.MethodPost, "/api/config", payload)
	if submitResp.status != http.StatusOK {
		t.Fatalf("POST /api/config 状态码错误: got=%d want=200 body=%s", submitResp.status, string(submitResp.body))
	}

	var submitData initSubmitResponse
	if err := json.Unmarshal(submitResp.body, &submitData); err != nil {
		t.Fatalf("解析配置响应失败: %v", err)
	}
	if submitData.Status != "ok" || !submitData.Ready {
		t.Fatalf("初始化成功响应不符合预期: %+v", submitData)
	}
	if !runtimeLoaded {
		t.Fatalf("初始化成功后未触发 runtime 加载")
	}
	if h.Init.IsEnabled() {
		t.Fatalf("初始化成功后仍处于 init 模式")
	}

	statusAfter, respCode := queryStatus(t, srv, "/api/status")
	if respCode != http.StatusOK {
		t.Fatalf("初始化后状态码错误: got=%d want=200", respCode)
	}
	if statusAfter.Status != "running" {
		t.Fatalf("初始化后状态错误: %+v", statusAfter)
	}

	configPath := filepath.Join(tmpDir, config.ConfigPath)
	if _, err := os.Stat(configPath); err != nil {
		t.Fatalf("配置文件未保存: %v", err)
	}
	savedCfg, err := config.Load(configPath)
	if err != nil {
		t.Fatalf("读取已保存配置失败: %v", err)
	}
	if savedCfg.Server.Public != cfg.Server.Public {
		t.Fatalf("公网地址未正确持久化: got=%q want=%q", savedCfg.Server.Public, cfg.Server.Public)
	}

	sqlitePath := filepath.Join(tmpDir, "data", "hashpay.db")
	if _, err := os.Stat(sqlitePath); err != nil {
		t.Fatalf("SQLite 文件未创建: %v", err)
	}

	reSubmitResp := requestJSON(t, srv, http.MethodPost, "/api/config", payload)
	if reSubmitResp.status != http.StatusNotFound {
		t.Fatalf("初始化完成后再次提交应返回 404: got=%d", reSubmitResp.status)
	}

	var reSubmitData initSubmitResponse
	if err := json.Unmarshal(reSubmitResp.body, &reSubmitData); err != nil {
		t.Fatalf("解析重复提交响应失败: %v", err)
	}
	if reSubmitData.Error != "初始化模式未启用" {
		t.Fatalf("重复提交错误信息不符合预期: %+v", reSubmitData)
	}
}

func TestInitFlowRuntimeLoadFailedKeepsInitMode(t *testing.T) {
	tmpDir := t.TempDir()
	originalWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("读取工作目录失败: %v", err)
	}
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("切换工作目录失败: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(originalWD)
	})

	cfg := &config.Config{
		Bot: config.BotConfig{
			Admin: 9528,
		},
	}

	h := handler.New(nil)
	h.Init.Enable(cfg.Bot.Admin)
	registerInitConfigHandler(h, cfg, func(*config.Config) error {
		return errors.New("runtime load failed")
	})

	srv := server.New(h, &server.Config{AdminID: cfg.Bot.Admin})

	payload := map[string]any{
		"database": map[string]any{
			"type": "sqlite",
		},
		"system": map[string]any{
			"currency":     "CNY",
			"timeout":      1800,
			"fast_confirm": true,
			"rate_adjust":  0,
		},
	}

	submitResp := requestJSON(t, srv, http.MethodPost, "/api/config", payload)
	if submitResp.status != http.StatusInternalServerError {
		t.Fatalf("runtime 加载失败应返回 500: got=%d body=%s", submitResp.status, string(submitResp.body))
	}

	var submitData initSubmitResponse
	if err := json.Unmarshal(submitResp.body, &submitData); err != nil {
		t.Fatalf("解析失败响应失败: %v", err)
	}
	if submitData.Error != "业务服务启动失败" {
		t.Fatalf("错误消息不符合预期: %+v", submitData)
	}

	if !h.Init.IsEnabled() {
		t.Fatalf("runtime 加载失败后不应退出 init 模式")
	}

	statusData, statusCode := queryStatus(t, srv, "/api/status")
	if statusCode != http.StatusOK {
		t.Fatalf("查询状态返回码错误: got=%d want=200", statusCode)
	}
	if statusData.Status != "init" || statusData.AdminID != cfg.Bot.Admin {
		t.Fatalf("runtime 加载失败后状态错误: %+v", statusData)
	}
}

type httpResult struct {
	status int
	body   []byte
}

func queryStatus(t *testing.T, srv *server.Server, path string) (initStatusResponse, int) {
	t.Helper()

	resp := requestJSON(t, srv, http.MethodGet, path, nil)
	var data initStatusResponse
	if err := json.Unmarshal(resp.body, &data); err != nil {
		t.Fatalf("解析状态响应失败: %v", err)
	}
	return data, resp.status
}

func requestJSON(t *testing.T, srv *server.Server, method, path string, payload any) httpResult {
	t.Helper()

	var body []byte
	if payload != nil {
		var err error
		body, err = json.Marshal(payload)
		if err != nil {
			t.Fatalf("序列化请求体失败: %v", err)
		}
	}

	req, err := http.NewRequest(method, path, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("创建请求失败: %v", err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("执行请求失败: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("读取响应失败: %v", err)
	}

	return httpResult{
		status: resp.StatusCode,
		body:   respBody,
	}
}
