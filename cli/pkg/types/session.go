package types

type Session struct {
	Token             string             `json:"token" yaml:"token"`
	User              string             `json:"user" yaml:"user"`
	Admin             bool               `json:"admin" yaml:"admin"`
	Groups            []string           `json:"groups" yaml:"groups"`
	Roles             []string           `json:"roles" yaml:"roles"`
	Lifetime          int                `json:"lifetime" yaml:"lifetime"`
	ConsoleURL        string             `json:"consoleURL,omitempty" yaml:"consoleURL,omitempty"`
	Interface         string             `json:"interface,omitempty" yaml:"interface,omitempty"`
	CatalogNamespaces []CatalogNamespace `json:"catalogNamespaces" yaml:"catalogNamespaces"`
	ServiceNamespaces []ServiceNamespace `json:"serviceNamespaces" yaml:"serviceNamespaces"`
	UserNamespace     UserNamespace      `json:"userNamespace" yaml:"userNamespace"`
}

type CatalogNamespace struct {
	Name        string `json:"name" yaml:"name"`
	DisplayName string `json:"displayName" yaml:"displayName"`
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
}

type ServiceNamespace struct {
	Name        string `json:"name" yaml:"name"`
	DisplayName string `json:"displayName" yaml:"displayName"`
	Requester   string `json:"requester,omitempty" yaml:"requester,omitempty"`
}

type UserNamespace struct {
	Name        string `json:"name" yaml:"name"`
	DisplayName string `json:"displayName" yaml:"displayName"`
	Requester   string `json:"requester,omitempty" yaml:"requester,omitempty"`
}
