package cmd

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/redhat-gpte/babylon/cli/pkg/config"
)

var (
	loginInsecure bool
)

var loginCmd = &cobra.Command{
	Use:   "login [server-url]",
	Short: "Log in to a Babylon instance",
	Long: `Log in to a Babylon instance.

The server URL is the Babylon web UI URL — the same URL you use
in your browser to access the catalog (e.g. demo.redhat.com).
You do not need a special API endpoint.

Authentication opens your browser to the Babylon login page.
After you log in, the CLI receives your session automatically.

Examples:
  # Login using the web UI URL
  babylon login demo.redhat.com

  # Full URL works too
  babylon login https://demo.redhat.com

  # Login and accept self-signed certificates
  babylon login demo.redhat.com --insecure

  # Use --server flag instead of positional argument
  babylon login --server demo.redhat.com`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		// Resolve server URL
		server := ""
		if len(args) > 0 {
			server = args[0]
		}
		if server == "" {
			server = serverURL
		}
		if server == "" {
			server = os.Getenv("BABYLON_SERVER")
		}
		if server == "" {
			existingCfg, _ := config.Load(cfgFile)
			if existingCfg != nil {
				server = existingCfg.Server
			}
		}
		if server == "" {
			fmt.Print("Babylon server URL: ")
			reader := bufio.NewReader(os.Stdin)
			input, _ := reader.ReadString('\n')
			server = strings.TrimSpace(input)
		}
		if server == "" {
			return fmt.Errorf("server URL is required")
		}

		server = normalizeURL(server)

		return browserLogin(server, loginInsecure)
	},
}

// cliCredentials holds the session token and proxy cookies received from the browser flow.
type cliCredentials struct {
	Token   string
	Cookies map[string]string // OAuth proxy cookies (name → value)
	User    string
}

// browserLogin performs the browser-based OAuth login flow.
//
// Flow:
//  1. Start a local HTTP server on a random port
//  2. Open browser to the Babylon OAuth flow, which redirects through OpenShift login
//  3. After authentication, the server-side /auth/cli-redirect endpoint POSTs
//     the session token and OAuth proxy cookie to our localhost callback
//  4. CLI stores both and uses them for all subsequent API calls
func browserLogin(server string, insecure bool) error {
	// Start local callback server
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("starting local server: %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port

	callbackURL := fmt.Sprintf("http://localhost:%d/callback", port)

	// Hit /auth/cli-redirect directly. The OAuth proxy will intercept the
	// unauthenticated request and redirect to OpenShift login. After login,
	// the proxy redirects back to this URL with the session cookie set.
	loginURL := fmt.Sprintf("%s/auth/cli-redirect?callback=%s", server, url.QueryEscape(callbackURL))

	credsCh := make(chan cliCredentials, 1)
	errCh := make(chan error, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			errCh <- fmt.Errorf("parsing callback form: %w", err)
			return
		}

		token := r.FormValue("token")
		user := r.FormValue("user")

		// Collect only the OAuth proxy cookie — ignore browser
		// tracking/analytics cookies that the callback also receives.
		cookies := make(map[string]string)
		for key, values := range r.Form {
			if strings.HasPrefix(key, "cookie_") && len(values) > 0 {
				cookieName := strings.TrimPrefix(key, "cookie_")
				if strings.HasPrefix(cookieName, "__oauth_proxy") {
					cookies[cookieName] = values[0]
				}
			}
		}

		if token == "" {
			http.Error(w, "Missing token", http.StatusBadRequest)
			errCh <- fmt.Errorf("callback received no token")
			return
		}

		// Respond with a success page
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html><html><body>
<h2>Login successful!</h2>
<p>You can close this tab and return to your terminal.</p>
<script>window.close();</script>
</body></html>`)

		credsCh <- cliCredentials{
			Token:   token,
			Cookies: cookies,
			User:    user,
		}
	})

	srv := &http.Server{Handler: mux}
	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	fmt.Println("Opening browser for authentication...")
	fmt.Printf("If the browser doesn't open, visit this URL manually:\n  %s\n\n", loginURL)
	fmt.Println("Waiting for login to complete...")

	openBrowser(loginURL)

	// Wait for callback or timeout
	var creds cliCredentials
	select {
	case creds = <-credsCh:
		// Success
	case err := <-errCh:
		srv.Shutdown(context.Background())
		return fmt.Errorf("login failed: %w", err)
	case <-time.After(5 * time.Minute):
		srv.Shutdown(context.Background())
		return fmt.Errorf("login timed out after 5 minutes")
	}

	srv.Shutdown(context.Background())

	// Save to config
	newCfg := &config.Config{
		Server: server,
		Auth: config.Auth{
			Token:   creds.Token,
			Cookies: creds.Cookies,
			User:    creds.User,
		},
		Insecure: insecure,
	}
	if err := config.Save(cfgFile, newCfg); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not save config: %v\n", err)
	}

	fmt.Printf("\nLogged in as %s\n", creds.User)
	fmt.Printf("Config saved to %s\n", config.DefaultPath())

	return nil
}


func normalizeURL(s string) string {
	s = strings.TrimRight(s, "/")
	if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") {
		s = "https://" + s
	}
	return s
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func init() {
	rootCmd.AddCommand(loginCmd)
	loginCmd.Flags().BoolVar(&loginInsecure, "insecure", false, "skip TLS certificate verification")
}
