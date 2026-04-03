package payments

func tronURL(debug bool) string {
	if debug {
		return "https://nile.trongrid.io"
	}
	return "https://api.trongrid.io"
}

func ethURL(debug bool) string {
	if debug {
		return "https://rpc.sepolia.org"
	}
	return "https://cloudflare-eth.com"
}

func bscURL(debug bool) string {
	if debug {
		return "https://data-seed-prebsc-1-s1.binance.org:8545"
	}
	return "https://bsc-dataseed.binance.org"
}

func polygonURL(debug bool) string {
	if debug {
		return "https://rpc-amoy.polygon.technology"
	}
	return "https://polygon-rpc.com"
}

func solanaURL(debug bool) string {
	if debug {
		return "https://api.devnet.solana.com"
	}
	return "https://api.mainnet-beta.solana.com"
}

func tonURL(debug bool) string {
	if debug {
		return "https://testnet.toncenter.com/api/v2"
	}
	return "https://toncenter.com/api/v2"
}
