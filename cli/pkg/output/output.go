package output

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"gopkg.in/yaml.v3"
)

// Format represents the output format.
type Format string

const (
	FormatTable Format = "table"
	FormatJSON  Format = "json"
	FormatYAML  Format = "yaml"
)

// Print outputs data in the specified format.
func Print(format Format, data interface{}, tableFunc func(w io.Writer)) error {
	switch format {
	case FormatJSON:
		return printJSON(data)
	case FormatYAML:
		return printYAML(data)
	default:
		tableFunc(os.Stdout)
		return nil
	}
}

func printJSON(data interface{}) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(data)
}

func printYAML(data interface{}) error {
	out, err := yaml.Marshal(data)
	if err != nil {
		return err
	}
	_, err = fmt.Fprint(os.Stdout, string(out))
	return err
}
