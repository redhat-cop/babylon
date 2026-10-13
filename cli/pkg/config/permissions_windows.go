package config

import (
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Windows mode bits do not describe access permissions; inspect the DACL instead.
func checkParentPermissions(path string, _ os.FileInfo, final bool) error {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return err
	}
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return err
	}
	return checkWindowsParentSecurity(path, sd, user.User.Sid.String(), final)
}

func trustedWindowsPrincipal(sid, currentUser string) bool {
	const trustedInstaller = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"
	return sid == currentUser || sid == "S-1-5-18" || sid == "S-1-5-32-544" || sid == trustedInstaller
}

func checkWindowsParentSecurity(path string, sd *windows.SECURITY_DESCRIPTOR, currentUser string, final bool) error {
	owner, _, err := sd.Owner()
	if err != nil || owner == nil || !trustedWindowsPrincipal(owner.String(), currentUser) {
		return fmt.Errorf("config parent path %q is owned by another user or group", path)
	}
	dacl, _, err := sd.DACL()
	if err != nil || dacl == nil {
		return fmt.Errorf("config parent path %q has no protective DACL", path)
	}
	// Ancestors may allow creating other users' directories (e.g. C:\Users),
	// but must not allow replacing our directory or changing its permissions.
	const fileDeleteChild = 0x0040
	unsafeAccess := uint32(windows.GENERIC_ALL | windows.DELETE | windows.WRITE_DAC | windows.WRITE_OWNER | fileDeleteChild)
	if final {
		unsafeAccess |= windows.GENERIC_WRITE | windows.FILE_WRITE_DATA | windows.FILE_APPEND_DATA
	}
	for i := uint32(0); i < uint32(dacl.AceCount); i++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(dacl, i, &ace); err != nil {
			return err
		}
		if ace.Header.AceFlags&windows.INHERIT_ONLY_ACE != 0 || ace.Header.AceType == windows.ACCESS_DENIED_ACE_TYPE {
			continue
		}
		if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
			return fmt.Errorf("config parent path %q has an unsupported access rule", path)
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart)).String()
		if !trustedWindowsPrincipal(sid, currentUser) && uint32(ace.Mask)&unsafeAccess != 0 {
			return fmt.Errorf("config parent path %q is writable by another user or group", path)
		}
	}
	return nil
}

func privateSecurityAttributes(inherit bool) (*windows.SecurityAttributes, error) {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, err
	}
	flags := ""
	if inherit {
		flags = "OICI"
	}
	// Only the current user and Local System can access credential data.
	sid := user.User.Sid.String()
	sd, err := windows.SecurityDescriptorFromString(fmt.Sprintf("O:%sD:P(A;%s;FA;;;%s)(A;%s;FA;;;SY)", sid, flags, sid, flags))
	if err != nil {
		return nil, err
	}
	return &windows.SecurityAttributes{
		Length:             uint32(unsafe.Sizeof(windows.SecurityAttributes{})),
		SecurityDescriptor: sd,
	}, nil
}

func createSecureDirectory(path string) error {
	attributes, err := privateSecurityAttributes(true)
	if err != nil {
		return err
	}
	name, err := windowsPath(path)
	if err != nil {
		return err
	}
	return windows.CreateDirectory(name, attributes)
}

func createConfigTemp(dir string) (*os.File, error) {
	attributes, err := privateSecurityAttributes(false)
	if err != nil {
		return nil, err
	}
	for i := 0; i < 10; i++ {
		path := filepath.Join(dir, ".config-"+rand.Text())
		name, err := windowsPath(path)
		if err != nil {
			return nil, err
		}
		// Apply the private DACL atomically; tightening an inherited ACL later
		// cannot revoke a handle another user opened while the file was visible.
		handle, err := windows.CreateFile(name, windows.GENERIC_READ|windows.GENERIC_WRITE,
			windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, attributes,
			windows.CREATE_NEW, windows.FILE_ATTRIBUTE_NORMAL, 0)
		if err == windows.ERROR_FILE_EXISTS || err == windows.ERROR_ALREADY_EXISTS {
			continue
		}
		if err != nil {
			return nil, err
		}
		return os.NewFile(uintptr(handle), path), nil
	}
	return nil, fmt.Errorf("could not create a unique config temporary file")
}

func windowsPath(path string) (*uint16, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if len(abs) >= 248 && !strings.HasPrefix(abs, `\\?\`) {
		if strings.HasPrefix(abs, `\\`) {
			abs = `\\?\UNC\` + abs[2:]
		} else {
			abs = `\\?\` + abs
		}
	}
	return windows.UTF16PtrFromString(abs)
}
