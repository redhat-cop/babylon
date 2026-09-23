package cmd

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBrowserLoginSaveFailureReturnsErrorWithoutSuccessMessage(t *testing.T) {
	originalCfgFile := cfgFile
	cfgFile = filepath.Join(t.TempDir(), "not-a-directory", "config.yaml")
	if err := os.WriteFile(filepath.Dir(cfgFile), []byte("block"), 0600); err != nil {
		t.Fatalf("create config parent file: %v", err)
	}
	t.Cleanup(func() { cfgFile = originalCfgFile })

	read, write, err := os.Pipe()
	if err != nil {
		t.Fatalf("create stdout pipe: %v", err)
	}
	originalStdout := os.Stdout
	os.Stdout = write
	t.Cleanup(func() { os.Stdout = originalStdout })

	result := make(chan error, 1)
	go func() { result <- browserLogin("https://babylon.example.test", false) }()

	scanner := bufio.NewScanner(read)
	var callbackURL string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "  https://babylon.example.test/auth/cli-redirect?") {
			loginURL, err := url.Parse(strings.TrimSpace(line))
			if err != nil {
				t.Fatalf("parse login URL: %v", err)
			}
			callbackURL, err = url.QueryUnescape(loginURL.Query().Get("callback"))
			if err != nil {
				t.Fatalf("decode callback URL: %v", err)
			}
			break
		}
	}
	if callbackURL == "" {
		t.Fatal("browser login did not print a callback URL")
	}

	response, err := http.PostForm(callbackURL, url.Values{"token": {"dummy-token"}, "user": {"dummy-user"}})
	if err != nil {
		t.Fatalf("post login callback: %v", err)
	}
	responseBody, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		t.Fatalf("read callback response: %v", err)
	}
	if strings.Contains(string(responseBody), "Login successful!") || !strings.Contains(string(responseBody), "Login received") {
		t.Fatalf("callback response = %s, want receipt without success", responseBody)
	}

	select {
	case err := <-result:
		if err == nil {
			t.Fatal("browserLogin returned nil after config save failure")
		}
		if !strings.Contains(err.Error(), "saving config") {
			t.Fatalf("browserLogin error = %v, want saving config error", err)
		}
	case <-time.After(time.Second):
		t.Fatal("browserLogin did not return after callback")
	}

	if err := write.Close(); err != nil {
		t.Fatalf("close stdout pipe: %v", err)
	}
	var output strings.Builder
	for scanner.Scan() {
		output.WriteString(scanner.Text())
		output.WriteByte('\n')
	}
	if strings.Contains(output.String(), "Config saved to") {
		t.Fatalf("unexpected save success output: %s", output.String())
	}
}

func TestReportLoginErrorDoesNotBlockWhenChannelIsFull(t *testing.T) {
	errs := make(chan error, 1)
	errs <- fmt.Errorf("first error")
	done := make(chan struct{})
	go func() {
		reportLoginError(errs, fmt.Errorf("second error"))
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("reportLoginError blocked on a full channel")
	}
}
