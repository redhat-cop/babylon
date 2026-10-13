package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unsafe"

	"golang.org/x/sys/windows"
)

func TestSaveWindowsConfigInWritableParent(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "config")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "config.yaml")
	for _, token := range []string{"dummy-token", "replacement-token"} {
		if err := Save(path, &Config{Auth: Auth{Token: token}}); err != nil {
			t.Fatalf("saving Windows config: %v", err)
		}
		cfg, err := Load(path)
		if err != nil || cfg.Auth.Token != token {
			t.Fatalf("config = %#v, error = %v", cfg, err)
		}
		sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
		if err != nil {
			t.Fatal(err)
		}
		user, err := windows.GetCurrentProcessToken().GetTokenUser()
		if err != nil {
			t.Fatal(err)
		}
		owner, _, err := sd.Owner()
		if err != nil || owner == nil || owner.String() != user.User.Sid.String() {
			t.Fatalf("credential owner differs from the current user: %v", err)
		}
		control, _, err := sd.Control()
		if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
			t.Fatalf("credential ACL is not protected from inheritance: %v", err)
		}
		dacl, _, err := sd.DACL()
		if err != nil || dacl == nil || dacl.AceCount != 2 {
			t.Fatalf("credential ACL = %s, error = %v", sd.String(), err)
		}
		for i := uint32(0); i < uint32(dacl.AceCount); i++ {
			var ace *windows.ACCESS_ALLOWED_ACE
			if err := windows.GetAce(dacl, i, &ace); err != nil {
				t.Fatal(err)
			}
			sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart)).String()
			if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE || (sid != user.User.Sid.String() && sid != "S-1-5-18") {
				t.Fatalf("credential ACL allows another principal: %s", sd.String())
			}
		}
	}
}

func TestSaveWindowsRejectsWritableParent(t *testing.T) {
	dir := t.TempDir()
	sd, err := windows.SecurityDescriptorFromString("D:P(A;OICI;FA;;;WD)")
	if err != nil {
		t.Fatal(err)
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		t.Fatal(err)
	}
	if err := windows.SetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil); err != nil {
		t.Fatal(err)
	}
	if err := Save(filepath.Join(dir, "config.yaml"), &Config{}); err == nil || !strings.Contains(err.Error(), "writable") {
		t.Fatalf("error = %v, want unsafe ACL rejection", err)
	}
}

func TestWindowsParentSecurity(t *testing.T) {
	const user = "S-1-5-21-1-2-3-1000"
	for _, tc := range []struct {
		name, descriptor, wantError string
		final                       bool
	}{
		{"untrusted owner", "O:S-1-5-21-1-2-3-1001D:P(A;;FA;;;" + user + ")", "owned", true},
		{"world writable directory", "O:" + user + "D:P(A;;FA;;;WD)", "writable", true},
		{"readable directory", "O:" + user + "D:P(A;;FA;;;" + user + ")(A;;GR;;;WD)", "", true},
		{"root permits creating other directories", "O:SYD:P(A;;0x4;;;WD)", "", false},
		{"root permits deleting our directory", "O:SYD:P(A;;0x40;;;WD)", "writable", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sd, err := windows.SecurityDescriptorFromString(tc.descriptor)
			if err != nil {
				t.Fatal(err)
			}
			err = checkWindowsParentSecurity("config", sd, user, tc.final)
			if tc.wantError == "" {
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil || !strings.Contains(err.Error(), tc.wantError) {
				t.Fatalf("error = %v, want %s", err, tc.wantError)
			}
		})
	}
}

func TestWindowsConfigObjectsHavePrivateACLAtCreation(t *testing.T) {
	dir := t.TempDir()
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		t.Fatal(err)
	}
	// Permit inherited read access, the scenario in which post-creation hardening
	// would let another process retain a readable handle to the temp file.
	sd, err := windows.SecurityDescriptorFromString(fmt.Sprintf("D:P(A;OICI;FA;;;%s)(A;OICI;GR;;;WD)", user.User.Sid.String()))
	if err != nil {
		t.Fatal(err)
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		t.Fatal(err)
	}
	if err := windows.SetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil); err != nil {
		t.Fatal(err)
	}
	file, err := createConfigTemp(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	privateDir := filepath.Join(dir, "private")
	if err := createSecureDirectory(privateDir); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{file.Name(), privateDir} {
		sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
		if err != nil {
			t.Fatal(err)
		}
		owner, _, err := sd.Owner()
		if err != nil || owner == nil || owner.String() != user.User.Sid.String() {
			t.Fatalf("new object owner differs from the current user: %v", err)
		}
		control, _, err := sd.Control()
		if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
			t.Fatalf("new object is not protected from inherited ACLs: %v", err)
		}
		dacl, _, err := sd.DACL()
		if err != nil || dacl == nil || dacl.AceCount != 2 {
			t.Fatalf("new object ACL = %s, error = %v", sd.String(), err)
		}
		if strings.Contains(sd.String(), ";;;WD)") {
			t.Fatalf("new object inherited world read access: %s", sd.String())
		}
	}
}
