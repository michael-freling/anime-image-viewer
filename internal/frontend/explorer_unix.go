//go:build !windows

package frontend

import (
	"os/exec"
	"path/filepath"
	"runtime"
)

// showInExplorer opens the native file manager for the given file.
// On macOS `open -R` reveals the file in Finder; on Linux we fall back
// to `xdg-open` on the parent directory (there is no portable
// "select file" command on Linux).
func showInExplorer(filePath string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", "-R", filePath).Start()
	}
	return exec.Command("xdg-open", filepath.Dir(filePath)).Start()
}
