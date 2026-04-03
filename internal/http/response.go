package httpapi

import "github.com/gofiber/fiber/v3"

type envelope struct {
	Data  any    `json:"data"`
	Info  string `json:"info"`
	Error string `json:"error"`
}

type requestEnvelope[T any] struct {
	Data T `json:"data"`
}

func ok(c fiber.Ctx, data any, info string) error {
	if data == nil {
		data = fiber.Map{}
	}
	return c.JSON(envelope{
		Data:  data,
		Info:  info,
		Error: "",
	})
}

func fail(c fiber.Ctx, status int, errMsg string) error {
	return c.Status(status).JSON(envelope{
		Data:  nil,
		Info:  "",
		Error: errMsg,
	})
}

func bindEnvelope[T any](c fiber.Ctx, target *T) error {
	var req requestEnvelope[T]
	if err := c.Bind().JSON(&req); err != nil {
		return err
	}
	*target = req.Data
	return nil
}
