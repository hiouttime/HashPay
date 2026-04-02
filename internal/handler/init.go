package handler

import (
	"sync"

	"hashpay/internal/service"

	"github.com/gofiber/fiber/v3"
)

type InitHandler struct {
	config *service.ConfigService
	users  *service.UserService

	mu       sync.RWMutex
	enabled  bool
	adminID  int64
	callback func(c fiber.Ctx) error
}

func NewInitHandler(config *service.ConfigService, users *service.UserService) *InitHandler {
	return &InitHandler{
		config: config,
		users:  users,
	}
}

// Enable 启用初始化模式
func (h *InitHandler) Enable(adminID int64) {
	h.mu.Lock()
	h.enabled = true
	h.adminID = adminID
	h.mu.Unlock()
}

// Disable 禁用初始化模式
func (h *InitHandler) Disable() {
	h.mu.Lock()
	h.enabled = false
	h.adminID = 0
	h.callback = nil
	h.mu.Unlock()
}

// SetCallback 设置初始化完成回调
func (h *InitHandler) SetCallback(adminID int64, cb func(c fiber.Ctx) error) {
	h.mu.Lock()
	h.enabled = true
	h.adminID = adminID
	h.callback = cb
	h.mu.Unlock()
}

// Status 获取初始化状态
func (h *InitHandler) Status(c fiber.Ctx) error {
	h.mu.RLock()
	enabled := h.enabled
	adminID := h.adminID
	h.mu.RUnlock()

	if !enabled {
		return c.JSON(fiber.Map{
			"status": "running",
		})
	}

	return c.JSON(fiber.Map{
		"status":   "init",
		"admin_id": adminID,
	})
}

// Config 处理初始化配置
func (h *InitHandler) Config(c fiber.Ctx) error {
	h.mu.RLock()
	enabled := h.enabled
	callback := h.callback
	h.mu.RUnlock()

	if !enabled {
		return fiber.NewError(fiber.StatusNotFound, "初始化模式未启用")
	}

	if callback != nil {
		return callback(c)
	}

	return fiber.NewError(fiber.StatusNotFound, "初始化回调未设置")
}

// IsEnabled 检查是否处于初始化模式
func (h *InitHandler) IsEnabled() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.enabled
}

// AdminID 获取管理员 ID
func (h *InitHandler) AdminID() int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.adminID
}
