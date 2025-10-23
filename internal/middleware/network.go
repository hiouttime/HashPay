package middleware

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Client struct {
	mu         sync.RWMutex
	timeout    time.Duration
	headers    map[string]string
	proxyURL   string
	skipSSL    bool
	httpClient *http.Client
}

type Request struct {
	URL      string            `json:"url"`
	Method   string            `json:"method,omitempty"`
	Headers  map[string]string `json:"headers,omitempty"`
	Data     any               `json:"data,omitempty"`
	Timeout  time.Duration     `json:"timeout,omitempty"`
	ProxyURL string            `json:"proxy_url,omitempty"`
}

// Response 表示一次 HTTP 响应
type Response struct {
	Code    int               `json:"status_code"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
	Data    map[string]any    `json:"data,omitempty"`
	URL     string            `json:"url"`
	Success bool              `json:"success"`
}

// NewClient 创建一个新的客户端实例
func NewClient(req ...*Request) *Client {
	client := &Client{
		timeout: 30 * time.Second,
		headers: map[string]string{
			"User-Agent":      "HashPay/1.0",
			"Accept":          "*/*",
			"Accept-Encoding": "gzip, deflate, br",
		},
	}

	if len(req) > 0 && req[0] != nil {
		if req[0].Timeout > 0 {
			client.timeout = req[0].Timeout
		}
		if len(req[0].Headers) > 0 {
			client.SetHeaders(req[0].Headers)
		}
		if req[0].ProxyURL != "" {
			client.SetProxy(req[0].ProxyURL)
		}
	}

	return client
}

// SetProxy 配置代理地址
func (c *Client) SetProxy(proxyURL string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.proxyURL = proxyURL
	c.httpClient = nil
}

// SetHeaders 设置默认请求头
func (c *Client) SetHeaders(headers map[string]string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.headers == nil {
		c.headers = make(map[string]string)
	}
	for k, v := range headers {
		c.headers[k] = v
	}
}

// SetTimeout 设置默认超时时间
func (c *Client) SetTimeout(timeout time.Duration) {
	if timeout <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.timeout = timeout
	if c.httpClient != nil {
		c.httpClient.Timeout = timeout
	}
}

// SkipSSL 配置是否跳过 SSL 验证
func (c *Client) SkipSSL(skip bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.skipSSL = skip
	c.httpClient = nil
}

// Get 发送 GET 请求
func (c *Client) Get(urlStr string, params ...map[string]any) (*Response, error) {
	req := Request{
		URL:    urlStr,
		Method: http.MethodGet,
	}
	if len(params) > 0 {
		req.Data = params[0]
	}
	return c.Do(req)
}

// Post 发送 POST 请求
func (c *Client) Post(urlStr string, data any) (*Response, error) {
	return c.Do(Request{
		URL:    urlStr,
		Method: http.MethodPost,
		Data:   data,
	})
}

// Do 执行请求
func (c *Client) Do(req Request) (*Response, error) {
	if strings.TrimSpace(req.URL) == "" {
		return nil, fmt.Errorf("request URL is required")
	}
	if req.Method == "" {
		req.Method = http.MethodGet
	}

	httpClient, err := c.getHTTPClient(req.ProxyURL)
	if err != nil {
		return nil, err
	}

	requestURL, err := c.applyQuery(req)
	if err != nil {
		return nil, err
	}

	bodyReader, contentType, err := buildBody(req)
	if err != nil {
		return nil, err
	}

	ctx := context.Background()
	if req.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, req.Timeout)
		defer cancel()
	}

	httpReq, err := http.NewRequestWithContext(ctx, req.Method, requestURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("build request failed: %w", err)
	}

	c.applyHeaders(httpReq, req, contentType)

	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response failed: %w", err)
	}

	response := &Response{
		Code:    resp.StatusCode,
		Headers: make(map[string]string, len(resp.Header)),
		Body:    string(bodyBytes),
		URL:     requestURL,
		Success: resp.StatusCode >= 200 && resp.StatusCode < 400,
	}

	for k, v := range resp.Header {
		if len(v) > 0 {
			response.Headers[k] = v[0]
		}
	}

	if ct := resp.Header.Get("Content-Type"); strings.Contains(ct, "json") {
		var data map[string]any
		if err := json.Unmarshal(bodyBytes, &data); err == nil {
			response.Data = data
		}
	}

	return response, nil
}

func (c *Client) getHTTPClient(proxyURL string) (*http.Client, error) {
	c.mu.RLock()
	client := c.httpClient
	globalProxy := c.proxyURL
	skipSSL := c.skipSSL
	timeout := c.timeout
	c.mu.RUnlock()

	if proxyURL == "" {
		proxyURL = globalProxy
	}

	if client != nil && proxyURL == globalProxy {
		return client, nil
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Re-check after acquiring lock
	if c.httpClient != nil && proxyURL == c.proxyURL {
		return c.httpClient, nil
	}

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: skipSSL,
		},
	}

	if proxyURL != "" {
		parsed, err := url.Parse(proxyURL)
		if err != nil {
			return nil, fmt.Errorf("invalid proxy URL: %w", err)
		}
		transport.Proxy = http.ProxyURL(parsed)
		// 当指定了代理时不复用全局客户端
		return &http.Client{
			Timeout:   timeout,
			Transport: transport,
		}, nil
	}

	c.httpClient = &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}
	return c.httpClient, nil
}

func (c *Client) applyQuery(req Request) (string, error) {
	requestURL := req.URL
	if req.Method != http.MethodGet || req.Data == nil {
		return requestURL, nil
	}

	parsed, err := url.Parse(req.URL)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}

	query := parsed.Query()
	switch params := req.Data.(type) {
	case map[string]any:
		for k, v := range params {
			query.Set(k, fmt.Sprintf("%v", v))
		}
	case url.Values:
		for k, vs := range params {
			for _, v := range vs {
				query.Add(k, v)
			}
		}
	default:
		// 非 map 类型直接忽略
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func buildBody(req Request) (io.Reader, string, error) {
	if req.Method == http.MethodGet || req.Data == nil {
		return nil, "", nil
	}

	switch payload := req.Data.(type) {
	case io.Reader:
		return payload, "", nil
	case []byte:
		return bytes.NewReader(payload), "", nil
	case string:
		return strings.NewReader(payload), "", nil
	case map[string]any:
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, "", fmt.Errorf("encode body failed: %w", err)
		}
		return bytes.NewReader(encoded), "application/json", nil
	default:
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, "", fmt.Errorf("encode body failed: %w", err)
		}
		return bytes.NewReader(encoded), "application/json", nil
	}
}

func (c *Client) applyHeaders(req *http.Request, r Request, contentType string) {
	c.mu.RLock()
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}
	c.mu.RUnlock()

	for k, v := range r.Headers {
		req.Header.Set(k, v)
	}

	if contentType != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", contentType)
	}
}
