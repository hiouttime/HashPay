package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hashpay/internal/database/sqlc"
	"log"
	"net/http"
	"time"

	tele "gopkg.in/telebot.v4"
)

type NotificationService struct {
	db     db.Querier
	bot    *tele.Bot
	client *http.Client
}

func NewNotificationService(database db.Querier, bot *tele.Bot) *NotificationService {
	return &NotificationService{
		db:  database,
		bot: bot,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *NotificationService) NotifyPayment(orderID string) error {
	ctx := context.Background()
	
	order, err := s.db.GetOrder(ctx, orderID)
	if err != nil {
		return fmt.Errorf("get order: %w", err)
	}
	
	s.notifyAdmins(order)
	
	if order.SiteID.Valid {
		s.notifySite(order)
	}
	
	return nil
}

func (s *NotificationService) notifyAdmins(order db.Order) {
	ctx := context.Background()
	admins, err := s.db.GetAdmins(ctx)
	if err != nil {
		log.Printf("Failed to get admins: %v", err)
		return
	}
	
	message := s.formatPaymentMessage(order)
	
	for _, admin := range admins {
		recipient := &tele.User{ID: admin.TgID}
		if _, err := s.bot.Send(recipient, message, tele.ModeHTML); err != nil {
			log.Printf("Failed to notify admin %d: %v", admin.TgID, err)
		}
	}
	
	s.notifyGroups(message)
}

func (s *NotificationService) notifyGroups(message string) {
	ctx := context.Background()
	
	groupsConfig, err := s.db.GetConfig(ctx, "notify_groups")
	if err != nil || groupsConfig == "" {
		return
	}
	
	var groups []int64
	if err := json.Unmarshal([]byte(groupsConfig), &groups); err != nil {
		return
	}
	
	for _, groupID := range groups {
		chat := &tele.Chat{ID: groupID}
		if _, err := s.bot.Send(chat, message, tele.ModeHTML); err != nil {
			log.Printf("Failed to notify group %d: %v", groupID, err)
		}
	}
}

func (s *NotificationService) notifySite(order db.Order) {
	ctx := context.Background()
	
	site, err := s.db.GetSite(ctx, order.SiteID.String)
	if err != nil {
		log.Printf("Failed to get site: %v", err)
		return
	}
	
	if site.Callback.Valid && site.Callback.String != "" {
		s.sendCallback(order, site)
	}
	
	if site.Notify.Valid && site.Notify.String != "" {
		s.sendNotify(order, site)
	}
}

func (s *NotificationService) sendCallback(order db.Order, site db.Site) {
	callbackData := map[string]interface{}{
		"order_id":     order.ID,
		"status":       "paid",
		"amount":       order.Amount,
		"currency":     order.Currency,
		"pay_amount":   order.PayAmount,
		"pay_currency": order.PayCurrency,
		"tx_hash":      order.TxHash,
		"paid_at":      order.PaidAt,
		"timestamp":    time.Now().Unix(),
	}
	
	jsonData, _ := json.Marshal(callbackData)
	
	req, err := http.NewRequest("POST", site.Callback.String, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to create callback request: %v", err)
		return
	}
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Key", site.ApiKey)
	
	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("Failed to send callback: %v", err)
		s.saveFailedNotification(order.ID, "callback", site.Callback.String, err.Error())
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		log.Printf("Callback returned status %d", resp.StatusCode)
		s.saveFailedNotification(order.ID, "callback", site.Callback.String, fmt.Sprintf("status %d", resp.StatusCode))
	}
}

func (s *NotificationService) sendNotify(order db.Order, site db.Site) {
	notifyData := map[string]interface{}{
		"order_id": order.ID,
		"status":   "paid",
		"amount":   order.Amount,
		"currency": order.Currency,
	}
	
	jsonData, _ := json.Marshal(notifyData)
	
	req, err := http.NewRequest("POST", site.Notify.String, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to create notify request: %v", err)
		return
	}
	
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("Failed to send notify: %v", err)
		return
	}
	defer resp.Body.Close()
}

func (s *NotificationService) formatPaymentMessage(order db.Order) string {
	var payInfo string
	if order.PayCurrency.Valid && order.PayAmount.Valid {
		payInfo = fmt.Sprintf("%.2f %s", order.PayAmount.Float64, order.PayCurrency.String)
	}
	
	var txInfo string
	if order.TxHash.Valid {
		txInfo = fmt.Sprintf("\n交易哈希: <code>%s</code>", order.TxHash.String[:16]+"...")
	}
	
	return fmt.Sprintf(`💰 <b>收款成功</b>

订单号: <code>%s</code>
金额: %.2f %s
支付: %s%s
时间: %s`,
		order.ID,
		order.Amount,
		order.Currency,
		payInfo,
		txInfo,
		time.Unix(order.PaidAt.Int64, 0).Format("01-02 15:04:05"),
	)
}

func (s *NotificationService) saveFailedNotification(orderID, notifType, target, reason string) {
	ctx := context.Background()
	now := time.Now().Unix()
	nextRetry := now + 300
	
	_, err := s.db.CreateNotification(ctx, db.CreateNotificationParams{
		OrderID:    orderID,
		Type:       notifType,
		Target:     target,
		Content:    reason,
		Status:     0,
		RetryCount: 0,
		NextRetry:  &nextRetry,
		CreatedAt:  now,
	})
	
	if err != nil {
		log.Printf("Failed to save notification: %v", err)
	}
}

func (s *NotificationService) ProcessPendingNotifications() {
	ctx := context.Background()
	now := time.Now().Unix()
	
	notifications, err := s.db.GetPendingNotifications(ctx, now)
	if err != nil {
		log.Printf("Failed to get pending notifications: %v", err)
		return
	}
	
	for _, notif := range notifications {
		s.retryNotification(notif)
	}
}

func (s *NotificationService) retryNotification(notif db.Notification) {
	ctx := context.Background()
	
	order, err := s.db.GetOrder(ctx, notif.OrderID)
	if err != nil {
		return
	}
	
	site, err := s.db.GetSite(ctx, order.SiteID.String)
	if err != nil {
		return
	}
	
	success := false
	if notif.Type == "callback" {
		s.sendCallback(order, site)
		success = true
	}
	
	now := time.Now().Unix()
	status := 0
	var nextRetry *int64
	
	if success {
		status = 1
	} else {
		retryCount := notif.RetryCount + 1
		if retryCount < 5 {
			next := now + int64(300*retryCount)
			nextRetry = &next
		} else {
			status = 2
		}
	}
	
	s.db.UpdateNotificationStatus(ctx, db.UpdateNotificationStatusParams{
		ID:         notif.ID,
		Status:     int64(status),
		RetryCount: notif.RetryCount + 1,
		NextRetry:  nextRetry,
		SentAt:     &now,
	})
}