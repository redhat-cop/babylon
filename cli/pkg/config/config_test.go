package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveSecuresFileWithoutChangingExistingParent(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "config")
	if err := os.Mkdir(dir, 0755); err != nil {
		t.Fatalf("creating config directory: %v", err)
	}
	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, []byte("server: old\n"), 0644); err != nil {
		t.Fatalf("creating config file: %v", err)
	}

	if err := Save(path, &Config{Server: "https://example.com"}); err != nil {
		t.Fatalf("saving config: %v", err)
	}

	dirInfo, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("stating config directory: %v", err)
	}
	if got := dirInfo.Mode().Perm(); got != 0755 {
		t.Errorf("config directory mode = %o, want 755", got)
	}
	fileInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stating config file: %v", err)
	}
	if got := fileInfo.Mode().Perm(); got != 0600 {
		t.Errorf("config file mode = %o, want 600", got)
	}
}

func TestSaveRejectsSymlinkPath(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target.yaml")
	if err := os.WriteFile(target, []byte("server: target\n"), 0600); err != nil {
		t.Fatalf("creating target config: %v", err)
	}
	path := filepath.Join(dir, "config.yaml")
	if err := os.Symlink(target, path); err != nil {
		t.Fatalf("creating config symlink: %v", err)
	}

	if err := Save(path, &Config{Server: "https://example.com"}); err == nil {
		t.Fatal("saving through a symlink succeeded, want error")
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("reading target config: %v", err)
	}
	if string(data) != "server: target\n" {
		t.Errorf("symlink target was modified: %q", data)
	}
}

func TestSaveRejectsSymlinkParent(t *testing.T) {
	dir := t.TempDir()
	targetDir := filepath.Join(dir, "target")
	if err := os.Mkdir(targetDir, 0700); err != nil {
		t.Fatalf("creating target directory: %v", err)
	}
	pathDir := filepath.Join(dir, "config")
	if err := os.Symlink(targetDir, pathDir); err != nil {
		t.Fatalf("creating config directory symlink: %v", err)
	}

	if err := Save(filepath.Join(pathDir, "config.yaml"), &Config{Server: "https://example.com"}); err == nil {
		t.Fatal("saving through a symlink parent succeeded, want error")
	}
	if _, err := os.Stat(filepath.Join(targetDir, "config.yaml")); !os.IsNotExist(err) {
		t.Errorf("symlink target contains config file, stat error = %v", err)
	}
}

func TestSaveRejectsWritableParent(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "shared")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatalf("creating shared directory: %v", err)
	}
	if err := os.Chmod(dir, 0777); err != nil {
		t.Fatalf("making shared directory writable: %v", err)
	}

	if err := Save(filepath.Join(dir, "config.yaml"), &Config{Server: "https://example.com"}); err == nil {
		t.Fatal("saving in a writable parent succeeded, want error")
	}
}

func TestSaveRejectsWritableAncestor(t *testing.T) {
	ancestor := filepath.Join(t.TempDir(), "shared")
	if err := os.Mkdir(ancestor, 0700); err != nil {
		t.Fatalf("creating shared ancestor: %v", err)
	}
	if err := os.Chmod(ancestor, 0777); err != nil {
		t.Fatalf("making shared ancestor writable: %v", err)
	}
	configDir := filepath.Join(ancestor, "config")
	if err := os.Mkdir(configDir, 0700); err != nil {
		t.Fatalf("creating config directory: %v", err)
	}

	if err := Save(filepath.Join(configDir, "config.yaml"), &Config{Server: "https://example.com"}); err == nil {
		t.Fatal("saving under a writable ancestor succeeded, want error")
	}
}
