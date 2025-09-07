package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"hashpay/internal/database/sqlc"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

type ProofService struct {
	db     db.Querier
	orders *OrderService
}

type PaymentProof struct {
	OrderID   string
	Questions []Question
	Answers   map[string]string
	ImageData string
}

type Question struct {
	ID      string
	Text    string
	Options []string
	Correct string
}

func NewProofService(database db.Querier, orders *OrderService) *ProofService {
	return &ProofService{
		db:     database,
		orders: orders,
	}
}

func (s *ProofService) GenerateQuestions(orderID string) ([]Question, error) {
	ctx := context.Background()
	
	order, err := s.orders.GetOrder(ctx, orderID)
	if err != nil {
		return nil, err
	}
	
	questions := []Question{}
	
	// 问题1: 支付链
	if order.PayChain.Valid {
		chain := order.PayChain.String
		q1 := Question{
			ID:   "chain",
			Text: "你付款的主链是什么？",
			Options: s.generateChainOptions(chain),
			Correct: chain,
		}
		questions = append(questions, q1)
	}
	
	// 问题2: 支付货币
	if order.PayCurrency.Valid {
		currency := order.PayCurrency.String
		q2 := Question{
			ID:   "currency",
			Text: "你付款的货币是？",
			Options: s.generateCurrencyOptions(currency),
			Correct: currency,
		}
		questions = append(questions, q2)
	}
	
	// 问题3: 支付金额
	if order.PayAmount.Valid {
		amount := decimal.NewFromFloat(order.PayAmount.Float64)
		q3 := Question{
			ID:   "amount",
			Text: fmt.Sprintf("确认付款金额 (%.2f %s)", amount.InexactFloat64(), order.PayCurrency.String),
			Options: []string{"金额一致", "金额不一致"},
			Correct: "金额一致",
		}
		questions = append(questions, q3)
	}
	
	return questions, nil
}

func (s *ProofService) VerifyAnswers(orderID string, answers map[string]string) bool {
	questions, err := s.GenerateQuestions(orderID)
	if err != nil {
		return false
	}
	
	for _, q := range questions {
		answer, exists := answers[q.ID]
		if !exists || answer != q.Correct {
			return false
		}
	}
	
	return true
}

func (s *ProofService) SubmitProof(proof PaymentProof) error {
	ctx := context.Background()
	
	// 验证答案
	if !s.VerifyAnswers(proof.OrderID, proof.Answers) {
		return fmt.Errorf("答案验证失败")
	}
	
	// 保存凭证
	now := time.Now().Unix()
	
	content := fmt.Sprintf("Order: %s\nAnswers: %v\nImage: %d bytes",
		proof.OrderID,
		proof.Answers,
		len(proof.ImageData),
	)
	
	_, err := s.db.CreateNotification(ctx, db.CreateNotificationParams{
		OrderID:   proof.OrderID,
		Type:      "proof",
		Target:    "admin",
		Content:   content,
		Status:    0,
		CreatedAt: now,
	})
	
	if err != nil {
		return fmt.Errorf("保存凭证失败: %w", err)
	}
	
	// TODO: 通知管理员审核
	
	return nil
}

func (s *ProofService) generateChainOptions(correct string) []string {
	allChains := []string{"TRON", "BSC", "ETH", "MATIC", "SOL", "TON"}
	options := []string{correct}
	
	for _, chain := range allChains {
		if chain != correct && len(options) < 4 {
			options = append(options, chain)
		}
	}
	
	// 打乱顺序
	for i := range options {
		j := randInt(len(options))
		options[i], options[j] = options[j], options[i]
	}
	
	return options
}

func (s *ProofService) generateCurrencyOptions(correct string) []string {
	allCurrencies := []string{"USDT", "USDC", "BUSD", "DAI", "TUSD", "USDD"}
	options := []string{correct}
	
	for _, currency := range allCurrencies {
		if currency != correct && len(options) < 4 {
			options = append(options, currency)
		}
	}
	
	// 打乱顺序
	for i := range options {
		j := randInt(len(options))
		options[i], options[j] = options[j], options[i]
	}
	
	return options
}

func (s *ProofService) SaveProofImage(orderID string, imageData string) (string, error) {
	// 解码 base64 图片
	data, err := base64.StdEncoding.DecodeString(
		strings.TrimPrefix(imageData, "data:image/png;base64,"),
	)
	if err != nil {
		return "", fmt.Errorf("解码图片失败: %w", err)
	}
	
	// 生成文件名
	filename := fmt.Sprintf("proof_%s_%d.png", orderID, time.Now().Unix())
	
	// TODO: 保存到文件系统或对象存储
	_ = data
	
	return filename, nil
}

func (s *ProofService) ReviewProof(orderID string, approved bool, reviewerID int64) error {
	ctx := context.Background()
	
	if approved {
		// 确认订单
		order, err := s.orders.GetOrder(ctx, orderID)
		if err != nil {
			return err
		}
		
		if order.Status == 0 {
			txHash := fmt.Sprintf("MANUAL_%d", time.Now().Unix())
			err = s.orders.ConfirmOrder(ctx, orderID, txHash)
			if err != nil {
				return err
			}
		}
	} else {
		// 记录拒绝
		now := time.Now().Unix()
		content := fmt.Sprintf("Proof rejected by admin %d", reviewerID)
		
		_, err := s.db.CreateNotification(ctx, db.CreateNotificationParams{
			OrderID:   orderID,
			Type:      "proof_rejected",
			Target:    fmt.Sprintf("%d", reviewerID),
			Content:   content,
			Status:    1,
			CreatedAt: now,
		})
		
		if err != nil {
			return err
		}
	}
	
	return nil
}

func randInt(n int) int {
	b := make([]byte, 1)
	rand.Read(b)
	return int(b[0]) % n
}