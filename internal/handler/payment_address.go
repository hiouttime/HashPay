package handler

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	evmAddressRE    = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)
	tronAddressRE   = regexp.MustCompile(`^T[1-9A-HJ-NP-Za-km-z]{33}$`)
	solanaAddressRE = regexp.MustCompile(`^[1-9A-HJ-NP-Za-km-z]{32,44}$`)
	tonRawRE        = regexp.MustCompile(`^-?[0-9]+:[0-9a-fA-F]{64}$`)
	tonFriendlyRE   = regexp.MustCompile(`^[A-Za-z0-9_-]{48}$`)
)

func validatePaymentAddress(platform, address string) error {
	plat := strings.ToLower(strings.TrimSpace(platform))
	addr := strings.TrimSpace(address)
	if addr == "" {
		return fmt.Errorf("收款地址不能为空")
	}

	switch plat {
	case "eth", "bsc", "polygon":
		if !evmAddressRE.MatchString(addr) {
			return fmt.Errorf("EVM 地址格式错误")
		}
	case "tron":
		if !tronAddressRE.MatchString(addr) {
			return fmt.Errorf("TRON 地址格式错误")
		}
	case "solana":
		if !solanaAddressRE.MatchString(addr) {
			return fmt.Errorf("Solana 地址格式错误")
		}
	case "ton":
		if !tonRawRE.MatchString(addr) && !tonFriendlyRE.MatchString(addr) {
			return fmt.Errorf("TON 地址格式错误")
		}
	default:
		// 交易所/钱包等平台仅校验非空，避免误伤外部账号格式
		return nil
	}

	return nil
}
