package xlog

import (
	"io"
	"log/slog"
)

func Nop() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
