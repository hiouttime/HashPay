package bot

import (
	"bytes"
	_ "embed"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"path/filepath"

	_ "golang.org/x/image/webp"
)

const customBannerPath = "runtime/bot/banner.png"

//go:embed assets/default.png
var defaultBanner []byte

func BannerData() ([]byte, error) {
	data, err := os.ReadFile(customBannerPath)
	if err == nil {
		return data, nil
	}
	if len(defaultBanner) == 0 {
		return nil, fmt.Errorf("default banner missing")
	}
	return defaultBanner, nil
}

func bannerVersion() int64 {
	info, err := os.Stat(customBannerPath)
	if err != nil {
		return 1
	}
	return info.ModTime().Unix()
}

func RelativeURL() string {
	return fmt.Sprintf("/media/banner?v=%d", bannerVersion())
}

func SaveBanner(data []byte) error {
	kind := http.DetectContentType(data)
	if kind != "image/jpeg" && kind != "image/png" && kind != "image/webp" {
		return fmt.Errorf("unsupported banner content type: %s", kind)
	}
	if _, _, err := image.DecodeConfig(bytes.NewReader(data)); err != nil {
		return err
	}
	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(customBannerPath), 0o755); err != nil {
		return err
	}
	file, err := os.Create(customBannerPath)
	if err != nil {
		return err
	}
	defer file.Close()
	return jpeg.Encode(file, decoded, &jpeg.Options{Quality: 92})
}
