package payments

func DefaultRegistry() *Registry {
	return NewRegistry(
		tronDriver{},
		evmDriver{},
		solanaDriver{},
		tonDriver{},
		binanceDriver{},
	)
}
