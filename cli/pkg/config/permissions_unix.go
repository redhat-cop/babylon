//go:build !windows

package config

import (
	"fmt"
	"os"
)

func checkParentPermissions(path string, info os.FileInfo, final bool) error {
	if info.Mode().Perm()&0022 != 0 && (final || info.Mode()&os.ModeSticky == 0) {
		return fmt.Errorf("config parent path %q must not be group or world writable", path)
	}
	return nil
}

func createSecureDirectory(path string) error {
	return os.Mkdir(path, 0700)
}

func createConfigTemp(dir string) (*os.File, error) {
	return os.CreateTemp(dir, ".config-") // Created with mode 0600 before it is visible.
}
