package service

import (
	"fmt"
	"hashpay/internal/database"
	"log"
	"net/http"
	"time"

	tele "gopkg.in/telebot.v4"
)

type NotificationService struct {
	db     *database.DB
	bot    *tele.Bot
	client *http.Client
}

func NewNotificationService(database *database.DB, bot *tele.Bot) *NotificationService {
	return &NotificationService{
		db:  database,
		bot: bot,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *NotificationService) NotifyPayment(orderID string) error {
	order, err := s.db.GetOrder(orderID)
	if err != nil {
		return fmt.Errorf("get order: %w", err)
	}
	
	// 通知管理员
	message := fmt.Sprintf(`💰 <b>收款成功</b>

订单号: <code>%s</code>
金额: %.2f %s
时间: %s`,
		order.ID,
		order.Amount,
		order.Currency,
		time.Unix(order.CreatedAt, 0).Format("01-02 15:04:05"),
	)
	
	// TODO: 获取管理员列表并通知
	log.Printf("Payment notification: %s", message)
	
	return nil
}

// 简化版本，暂时注释掉复杂功能
func (s *NotificationService) ProcessPendingNotifications() {
	// TODO: 实现待处理通知的重试
	log.Println("Processing pending notifications...")
}