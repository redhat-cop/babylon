package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    string `yaml:"server,omitempty"`
	Namespace string `yaml:"namespace,omitempty"`
	Output    string `yaml:"output,omitempty"`
	Insecure  bool   `yaml:"insecure,omitempty"`
	Auth      Auth   `yaml:"auth,omitempty"`
}

type Auth struct {
	Token   string            `yaml:"token,omitempty"`
	Cookies map[string]string `yaml:"cookies,omitempty"`
	User    string            `yaml:"user,omitempty"`
}

func DefaultPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	configDir := os.Getenv("XDG_CONFIG_HOME")
	if configDir == "" {
		configDir = filepath.Join(home, ".config")
	}
	return filepath.Join(configDir, "babylon", "config.yaml")
}

func Load(path string) (*Config, error) {
	if path == "" {
		path = DefaultPath()
	}
	cfg := &Config{}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func Save(path string, cfg *Config) error {
	if path == "" {
		path = DefaultPath()
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	if err := secureParentDir(filepath.Dir(path)); err != nil {
		return err
	}
	if info, err := os.Lstat(path); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("config path %q is a symbolic link", path)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	file, err := os.CreateTemp(filepath.Dir(path), ".config-")
	if err != nil {
		return err
	}
	tempPath := file.Name()
	defer os.Remove(tempPath)
	if err := file.Chmod(0600); err != nil {
		_ = file.Close()
		return err
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}

func secureParentDir(dir string) error {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	root := filepath.VolumeName(absDir) + string(os.PathSeparator)
	rel, err := filepath.Rel(root, absDir)
	if err != nil {
		return err
	}
	current := root
	for _, component := range strings.Split(rel, string(os.PathSeparator)) {
		if component == "." {
			continue
		}
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) {
			if err := os.Mkdir(current, 0700); err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("config parent path %q is a symbolic link", current)
		}
		if !info.IsDir() {
			return fmt.Errorf("config parent path %q is not a directory", current)
		}
		if info.Mode().Perm()&0022 != 0 && info.Mode()&os.ModeSticky == 0 {
			return fmt.Errorf("config parent path %q must not be group or world writable", current)
		}
		if current == absDir && info.Mode().Perm()&0022 != 0 {
			return fmt.Errorf("config parent path %q must not be group or world writable", current)
		}
	}
	return nil
}
