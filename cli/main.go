package main

import "github.com/redhat-gpte/babylon/cli/cmd"

// Build info, injected via ldflags
var version = "development"
var buildCommit = "HEAD"
var buildTime = "undefined"

func main() {
	cmd.SetBuildInfo(version, buildCommit, buildTime)
	cmd.Execute()
}
