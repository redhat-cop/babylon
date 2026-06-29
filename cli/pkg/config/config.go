package config

import (
	"os"
	"path/filepath"

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
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}
