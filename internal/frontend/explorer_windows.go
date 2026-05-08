//go:build windows

package frontend

import (
	"os/exec"
	"syscall"
)

// showInExplorer opens Windows Explorer with the given file selected.
//
// Go's exec.Command escapes arguments using CRT rules, but explorer.exe
// does not parse arguments that way — paths with spaces get mangled.
// Setting SysProcAttr.CmdLine bypasses Go's escaping so we can pass the
// exact command line Windows expects.
func showInExplorer(filePath string) error {
	cmd := exec.Command("explorer")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CmdLine: `explorer /select,"` + filePath + `"`,
	}
	return cmd.Start()
}
