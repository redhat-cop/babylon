package output

import (
	"fmt"
	"io"
	"strings"
	"text/tabwriter"
)

// Table provides a simple table printer.
type Table struct {
	headers []string
	rows    [][]string
}

// NewTable creates a new table with the given headers.
func NewTable(headers ...string) *Table {
	return &Table{headers: headers}
}

// AddRow adds a row to the table.
func (t *Table) AddRow(values ...string) {
	t.rows = append(t.rows, values)
}

// Render writes the table to the given writer.
func (t *Table) Render(w io.Writer) {
	tw := tabwriter.NewWriter(w, 0, 4, 2, ' ', 0)

	// Header
	fmt.Fprintln(tw, strings.Join(t.headers, "\t"))

	// Rows
	for _, row := range t.rows {
		fmt.Fprintln(tw, strings.Join(row, "\t"))
	}

	tw.Flush()
}

// PrintMessage prints a simple message (for empty results, etc).
func PrintMessage(w io.Writer, msg string) {
	fmt.Fprintln(w, msg)
}
