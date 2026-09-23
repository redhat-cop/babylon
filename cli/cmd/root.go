package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/api"
	"github.com/redhat-gpte/babylon/cli/pkg/config"
	"github.com/redhat-gpte/babylon/cli/pkg/output"
)

var (
	cfgFile      string
	serverURL    string
	namespace    string
	outputFormat string
	debug        bool

	cfg       *config.Config
	apiClient *api.Client
)

// Commands that handle their own auth (or don't need it).
var noAuthCommands = map[string]bool{
	"help":       true,
	"version":    true,
	"login":      true,
	"completion": true,
}

var rootCmd = &cobra.Command{
	Use:   "babylon",
	Short: "Babylon CLI - manage demo and lab services",
	Long: `A command-line interface for the Babylon service provisioning platform.

Get started by logging in:
  babylon login https://babylon.apps.example.com`,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// Skip auth for commands that handle it themselves
		if noAuthCommands[cmd.Name()] {
			return nil
		}

		var err error
		cfg, err = config.Load(cfgFile)
		if err != nil {
			return fmt.Errorf("loading config: %w", err)
		}

		// Resolve server URL: flag > env > config
		if serverURL == "" {
			serverURL = os.Getenv("BABYLON_SERVER")
		}
		if serverURL == "" {
			serverURL = cfg.Server
		}
		if serverURL == "" {
			return fmt.Errorf("not logged in; run 'babylon login <server-url>' first")
		}

		if cfg.Auth.Token == "" || len(cfg.Auth.Cookies) == 0 {
			return fmt.Errorf("not logged in; run 'babylon login <server-url>' first")
		}

		// Resolve namespace: flag > env > config (session default applied later)
		if namespace == "" {
			namespace = os.Getenv("BABYLON_NAMESPACE")
		}
		if namespace == "" {
			namespace = cfg.Namespace
		}

		// Resolve output format
		if outputFormat == "" {
			outputFormat = cfg.Output
		}
		if outputFormat == "" {
			outputFormat = "table"
		}

		// Create API client
		apiClient = api.NewClient(serverURL)
		apiClient.Token = cfg.Auth.Token
		apiClient.Cookies = cfg.Auth.Cookies
		apiClient.Debug = debug
		if cfg.Insecure {
			apiClient.SetInsecureSkipVerify(true)
		}

		// Fetch session to get user context
		if err := apiClient.EnsureSession(); err != nil {
			return fmt.Errorf("session expired (run 'babylon login'): %w", err)
		}

		// Default namespace to user's namespace from session
		if namespace == "" {
			namespace = apiClient.UserNamespace()
		}

		return nil
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default: ~/.config/babylon/config.yaml)")
	rootCmd.PersistentFlags().StringVar(&serverURL, "server", "", "Babylon web UI URL (e.g. demo.redhat.com)")
	rootCmd.PersistentFlags().StringVarP(&namespace, "namespace", "n", "", "target namespace")
	rootCmd.PersistentFlags().StringVarP(&outputFormat, "output", "o", "", "output format: table, json, yaml (default: table)")
	rootCmd.PersistentFlags().BoolVar(&debug, "debug", false, "enable debug output")
}

func getOutputFormat() output.Format {
	switch outputFormat {
	case "json":
		return output.FormatJSON
	case "yaml":
		return output.FormatYAML
	default:
		return output.FormatTable
	}
}

func exitError(msg string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "Error: "+msg+"\n", args...)
	os.Exit(1)
}
