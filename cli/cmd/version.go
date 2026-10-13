package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var (
	buildVersion = "development"
	buildCommit  = "HEAD"
	buildTime    = "undefined"
)

func SetBuildInfo(version, commit, time string) {
	buildVersion = version
	buildCommit = commit
	buildTime = time
}

func init() {
	rootCmd.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print version information",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("babylon %s (commit: %s, built: %s)\n", buildVersion, buildCommit, buildTime)
		},
	})
}
