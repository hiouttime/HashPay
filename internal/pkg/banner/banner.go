package banner

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"path/filepath"
	"time"

	_ "golang.org/x/image/webp"
)

const (
	Dir         = "data/banner"
	DefaultFile = "default.jpg"
	CustomFile  = "custom.jpg"
)

func DefaultPath() string {
	return filepath.Join(Dir, DefaultFile)
}

func CustomPath() string {
	return filepath.Join(Dir, CustomFile)
}

func EnsureDir() error {
	return os.MkdirAll(Dir, 0755)
}

func CurrentPath() string {
	if _, err := os.Stat(CustomPath()); err == nil {
		return CustomPath()
	}
	return DefaultPath()
}

func Version() int64 {
	info, err := os.Stat(CurrentPath())
	if err != nil {
		return time.Now().Unix()
	}
	return info.ModTime().Unix()
}

func RelativeURL() string {
	return fmt.Sprintf("/media/banner?v=%d", Version())
}

func SaveAsJPEG(data []byte) error {
	if err := EnsureDir(); err != nil {
		return err
	}
	kind := http.DetectContentType(data)
	if kind != "image/jpeg" && kind != "image/png" && kind != "image/webp" {
		return fmt.Errorf("unsupported banner content type: %s", kind)
	}

	img, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return err
	}
	if img.Width == 0 || img.Height == 0 {
		return fmt.Errorf("invalid banner image")
	}

	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return err
	}

	file, err := os.Create(CustomPath())
	if err != nil {
		return err
	}
	defer file.Close()

	return jpeg.Encode(file, decoded, &jpeg.Options{Quality: 92})
}
