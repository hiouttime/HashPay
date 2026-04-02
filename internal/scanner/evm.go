package scanner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const evmTransferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

type evmToken struct {
	Symbol    string
	Decimals  int32
	Contracts []string
}

type EVMAPI struct {
	chain        ChainType
	rpcURL       string
	nativeSymbol string
	tokens       []evmToken
	client       *http.Client
}

func NewEVMAPI(chain ChainType, rpcURL string) *EVMAPI {
	return NewEVMAPIWithNetwork(chain, rpcURL, false)
}

func NewEVMAPIWithNetwork(chain ChainType, rpcURL string, testnet bool) *EVMAPI {
	return &EVMAPI{
		chain:        chain,
		rpcURL:       rpcURL,
		nativeSymbol: evmNativeSymbol(chain),
		tokens:       evmTokens(chain, testnet),
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (e *EVMAPI) ChainType() ChainType {
	return e.chain
}

func (e *EVMAPI) GetTransactions(addr string, fromTime int64) ([]Transaction, error) {
	if !e.ValidateAddress(addr) {
		return nil, fmt.Errorf("无效地址")
	}

	latest, err := e.blockNumber()
	if err != nil {
		return nil, err
	}

	tokenFrom := latest - 256
	if tokenFrom < 0 {
		tokenFrom = 0
	}

	nativeFrom := latest - 64
	if nativeFrom < 0 {
		nativeFrom = 0
	}

	tokenTxs, err := e.fetchTokenTransfers(addr, tokenFrom, latest, fromTime)
	if err != nil {
		return nil, err
	}

	nativeTxs, err := e.fetchNativeTransfers(addr, nativeFrom, latest, fromTime)
	if err != nil {
		return nil, err
	}

	txs := make([]Transaction, 0, len(tokenTxs)+len(nativeTxs))
	txs = append(txs, tokenTxs...)
	txs = append(txs, nativeTxs...)
	return txs, nil
}

func (e *EVMAPI) GetTransaction(hash string) (*Transaction, error) {
	return nil, nil
}

func (e *EVMAPI) ValidateAddress(addr string) bool {
	return len(addr) == 42 && strings.HasPrefix(addr, "0x")
}

func (e *EVMAPI) fetchTokenTransfers(addr string, fromBlock, toBlock, fromTime int64) ([]Transaction, error) {
	toTopic := "0x000000000000000000000000" + strings.ToLower(strings.TrimPrefix(addr, "0x"))
	timeCache := make(map[string]int64)
	txs := make([]Transaction, 0, 16)

	for _, token := range e.tokens {
		for _, contract := range token.Contracts {
			logs, err := e.getLogs(contract, toTopic, fromBlock, toBlock)
			if err != nil {
				return nil, err
			}

			for _, item := range logs {
				ts, ok := timeCache[item.BlockNumber]
				if !ok {
					var block struct {
						Timestamp string `json:"timestamp"`
					}
					if err := e.rpcCall("eth_getBlockByNumber", []any{item.BlockNumber, false}, &block); err != nil {
						return nil, err
					}
					ts = parseHexInt64(block.Timestamp)
					timeCache[item.BlockNumber] = ts
				}

				if ts < fromTime {
					continue
				}

				value := parseHexBigInt(item.Data)
				if value.Sign() <= 0 {
					continue
				}

				amount := decimal.NewFromBigInt(value, 0).Div(decimal.New(1, token.Decimals))
				txs = append(txs, Transaction{
					Hash:      item.TransactionHash,
					Chain:     e.chain,
					To:        addr,
					Amount:    amount,
					Currency:  token.Symbol,
					BlockNum:  parseHexInt64(item.BlockNumber),
					Timestamp: ts,
				})
			}
		}
	}

	return txs, nil
}

func (e *EVMAPI) fetchNativeTransfers(addr string, fromBlock, toBlock, fromTime int64) ([]Transaction, error) {
	target := strings.ToLower(addr)
	txs := make([]Transaction, 0, 8)

	for blockNum := fromBlock; blockNum <= toBlock; blockNum++ {
		var block struct {
			Timestamp    string `json:"timestamp"`
			Transactions []struct {
				Hash  string `json:"hash"`
				From  string `json:"from"`
				To    string `json:"to"`
				Value string `json:"value"`
			} `json:"transactions"`
		}

		if err := e.rpcCall("eth_getBlockByNumber", []any{toHex(blockNum), true}, &block); err != nil {
			return nil, err
		}

		ts := parseHexInt64(block.Timestamp)
		if ts < fromTime {
			continue
		}

		for _, item := range block.Transactions {
			if !strings.EqualFold(strings.TrimSpace(item.To), target) {
				continue
			}

			value := parseHexBigInt(item.Value)
			if value.Sign() <= 0 {
				continue
			}

			amount := decimal.NewFromBigInt(value, 0).Div(decimal.New(1, 18))
			txs = append(txs, Transaction{
				Hash:      item.Hash,
				Chain:     e.chain,
				From:      item.From,
				To:        item.To,
				Amount:    amount,
				Currency:  e.nativeSymbol,
				BlockNum:  blockNum,
				Timestamp: ts,
			})
		}
	}

	return txs, nil
}

func (e *EVMAPI) getLogs(contract, toTopic string, fromBlock, toBlock int64) ([]struct {
	BlockNumber     string `json:"blockNumber"`
	TransactionHash string `json:"transactionHash"`
	Data            string `json:"data"`
}, error) {
	filter := map[string]any{
		"fromBlock": toHex(fromBlock),
		"toBlock":   toHex(toBlock),
		"address":   strings.ToLower(contract),
		"topics": []any{
			evmTransferTopic,
			nil,
			toTopic,
		},
	}

	var result []struct {
		BlockNumber     string `json:"blockNumber"`
		TransactionHash string `json:"transactionHash"`
		Data            string `json:"data"`
	}
	err := e.rpcCall("eth_getLogs", []any{filter}, &result)
	return result, err
}

func (e *EVMAPI) blockNumber() (int64, error) {
	var result string
	if err := e.rpcCall("eth_blockNumber", []any{}, &result); err != nil {
		return 0, err
	}
	return parseHexInt64(result), nil
}

func (e *EVMAPI) rpcCall(method string, params any, out any) error {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  method,
		"params":  params,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, e.rpcURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return err
	}
	if envelope.Error != nil {
		return fmt.Errorf("rpc error %d: %s", envelope.Error.Code, envelope.Error.Message)
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(envelope.Result, out)
}

type EVMHubAPI struct {
	apis []*EVMAPI
}

func NewEVMHubAPI(apis ...*EVMAPI) *EVMHubAPI {
	items := make([]*EVMAPI, 0, len(apis))
	for _, api := range apis {
		if api != nil {
			items = append(items, api)
		}
	}
	return &EVMHubAPI{apis: items}
}

func (h *EVMHubAPI) ChainType() ChainType {
	return ChainEVM
}

func (h *EVMHubAPI) GetTransactions(addr string, fromTime int64) ([]Transaction, error) {
	txs := make([]Transaction, 0, 16)
	var lastErr error

	for _, api := range h.apis {
		part, err := api.GetTransactions(addr, fromTime)
		if err != nil {
			lastErr = err
			continue
		}
		txs = append(txs, part...)
	}

	if len(txs) > 0 || lastErr == nil {
		return txs, nil
	}
	return nil, lastErr
}

func (h *EVMHubAPI) GetTransaction(hash string) (*Transaction, error) {
	return nil, nil
}

func (h *EVMHubAPI) ValidateAddress(addr string) bool {
	return len(addr) == 42 && strings.HasPrefix(addr, "0x")
}

func evmTokens(chain ChainType, testnet bool) []evmToken {
	if testnet {
		switch chain {
		case ChainETH:
			return []evmToken{
				{Symbol: "USDC", Decimals: 6, Contracts: []string{"0x1c7d4b196cb0c7b01d743fbc6116a902379c7238"}},
			}
		case ChainPolygon:
			return []evmToken{
				{Symbol: "USDC", Decimals: 6, Contracts: []string{"0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582"}},
			}
		default:
			return nil
		}
	}
	switch chain {
	case ChainETH:
		return []evmToken{
			{Symbol: "USDT", Decimals: 6, Contracts: []string{"0xdac17f958d2ee523a2206206994597c13d831ec7"}},
			{Symbol: "USDC", Decimals: 6, Contracts: []string{"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"}},
		}
	case ChainBSC:
		return []evmToken{
			{Symbol: "USDT", Decimals: 18, Contracts: []string{"0x55d398326f99059ff775485246999027b3197955"}},
			{Symbol: "USDC", Decimals: 18, Contracts: []string{"0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"}},
		}
	case ChainPolygon:
		return []evmToken{
			{Symbol: "USDT", Decimals: 6, Contracts: []string{"0xc2132d05d31c914a87c6611c10748aeb04b58e8f"}},
			{Symbol: "USDC", Decimals: 6, Contracts: []string{"0x2791bca1f2de4661ed88a30c99a7a9449aa84174"}},
		}
	default:
		return nil
	}
}

func evmNativeSymbol(chain ChainType) string {
	switch chain {
	case ChainETH:
		return "ETH"
	case ChainBSC:
		return "BNB"
	case ChainPolygon:
		return "MATIC"
	default:
		return "ETH"
	}
}

func parseHexInt64(raw string) int64 {
	n := parseHexBigInt(raw)
	return n.Int64()
}

func parseHexBigInt(raw string) *big.Int {
	val := new(big.Int)
	clean := strings.TrimPrefix(strings.TrimSpace(raw), "0x")
	if clean == "" {
		return val
	}
	val.SetString(clean, 16)
	return val
}

func toHex(n int64) string {
	return fmt.Sprintf("0x%x", n)
}
