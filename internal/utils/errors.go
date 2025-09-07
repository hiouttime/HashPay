package utils

import (
	"errors"
	"fmt"
	"time"
)

// 业务错误码
const (
	ErrCodeSuccess          = 0
	ErrCodeInvalidParams    = 400
	ErrCodeUnauthorized     = 401
	ErrCodeForbidden        = 403
	ErrCodeNotFound         = 404
	ErrCodeTimeout          = 408
	ErrCodeTooManyRequests  = 429
	ErrCodeInternalError    = 500
	ErrCodeServiceUnavailable = 503
	
	// 业务错误码 1000+
	ErrCodeOrderNotFound    = 1001
	ErrCodeOrderExpired     = 1002
	ErrCodeOrderPaid        = 1003
	ErrCodeInvalidAmount    = 1004
	ErrCodeInvalidCurrency  = 1005
	ErrCodeInvalidPayMethod = 1006
	ErrCodeInvalidSign      = 1007
	ErrCodeInsufficientBalance = 1008
	ErrCodePaymentFailed    = 1009
	ErrCodeDuplicateOrder   = 1010
	
	// API 错误码 2000+
	ErrCodeAPILimit         = 2001
	ErrCodeAPIUnavailable   = 2002
	ErrCodeAPIInvalidKey    = 2003
	ErrCodeAPIRequestFailed = 2004
	
	// 系统错误码 3000+
	ErrCodeDBError          = 3001
	ErrCodeCacheError       = 3002
	ErrCodeConfigError      = 3003
)

// 业务错误
type BizError struct {
	Code    int
	Message string
	Details any
}

func (e *BizError) Error() string {
	return fmt.Sprintf("[%d] %s", e.Code, e.Message)
}

func NewBizError(code int, message string) *BizError {
	return &BizError{
		Code:    code,
		Message: message,
	}
}

func NewBizErrorWithDetails(code int, message string, details any) *BizError {
	return &BizError{
		Code:    code,
		Message: message,
		Details: details,
	}
}

// 预定义错误
var (
	ErrInvalidParams    = NewBizError(ErrCodeInvalidParams, "Invalid parameters")
	ErrUnauthorized     = NewBizError(ErrCodeUnauthorized, "Unauthorized")
	ErrForbidden        = NewBizError(ErrCodeForbidden, "Forbidden")
	ErrNotFound         = NewBizError(ErrCodeNotFound, "Not found")
	ErrTimeout          = NewBizError(ErrCodeTimeout, "Request timeout")
	ErrTooManyRequests  = NewBizError(ErrCodeTooManyRequests, "Too many requests")
	ErrInternalError    = NewBizError(ErrCodeInternalError, "Internal server error")
	ErrServiceUnavailable = NewBizError(ErrCodeServiceUnavailable, "Service unavailable")
	
	ErrOrderNotFound    = NewBizError(ErrCodeOrderNotFound, "Order not found")
	ErrOrderExpired     = NewBizError(ErrCodeOrderExpired, "Order expired")
	ErrOrderPaid        = NewBizError(ErrCodeOrderPaid, "Order already paid")
	ErrInvalidAmount    = NewBizError(ErrCodeInvalidAmount, "Invalid amount")
	ErrInvalidCurrency  = NewBizError(ErrCodeInvalidCurrency, "Invalid currency")
	ErrInvalidPayMethod = NewBizError(ErrCodeInvalidPayMethod, "Invalid payment method")
	ErrInvalidSign      = NewBizError(ErrCodeInvalidSign, "Invalid signature")
	ErrInsufficientBalance = NewBizError(ErrCodeInsufficientBalance, "Insufficient balance")
	ErrPaymentFailed    = NewBizError(ErrCodePaymentFailed, "Payment failed")
	ErrDuplicateOrder   = NewBizError(ErrCodeDuplicateOrder, "Duplicate order")
	
	ErrAPILimit         = NewBizError(ErrCodeAPILimit, "API rate limit exceeded")
	ErrAPIUnavailable   = NewBizError(ErrCodeAPIUnavailable, "API unavailable")
	ErrAPIInvalidKey    = NewBizError(ErrCodeAPIInvalidKey, "Invalid API key")
	ErrAPIRequestFailed = NewBizError(ErrCodeAPIRequestFailed, "API request failed")
	
	ErrDBError          = NewBizError(ErrCodeDBError, "Database error")
	ErrCacheError       = NewBizError(ErrCodeCacheError, "Cache error")
	ErrConfigError      = NewBizError(ErrCodeConfigError, "Configuration error")
)

// 错误包装
func WrapError(err error, message string) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", message, err)
}

// 错误判断
func IsBizError(err error) bool {
	var bizErr *BizError
	return errors.As(err, &bizErr)
}

func GetBizError(err error) *BizError {
	var bizErr *BizError
	if errors.As(err, &bizErr) {
		return bizErr
	}
	return nil
}

// 错误恢复包装
func SafeGo(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				Error("Goroutine panic", "panic", r)
			}
		}()
		fn()
	}()
}

// 重试机制
func Retry(fn func() error, maxRetries int, delay time.Duration) error {
	var lastErr error
	
	for i := 0; i < maxRetries; i++ {
		if err := fn(); err == nil {
			return nil
		} else {
			lastErr = err
			if i < maxRetries-1 {
				time.Sleep(delay)
				delay *= 2 // 指数退避
			}
		}
	}
	
	return fmt.Errorf("failed after %d retries: %w", maxRetries, lastErr)
}

// 错误响应
type ErrorResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func NewErrorResponse(err error) *ErrorResponse {
	if bizErr := GetBizError(err); bizErr != nil {
		return &ErrorResponse{
			Code:    bizErr.Code,
			Message: bizErr.Message,
			Details: bizErr.Details,
		}
	}
	
	return &ErrorResponse{
		Code:    ErrCodeInternalError,
		Message: "Internal server error",
	}
}