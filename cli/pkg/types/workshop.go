package types

type Workshop struct {
	APIVersion string         `json:"apiVersion" yaml:"apiVersion"`
	Kind       string         `json:"kind" yaml:"kind"`
	Metadata   ObjectMeta     `json:"metadata" yaml:"metadata"`
	Spec       WorkshopSpec   `json:"spec" yaml:"spec"`
	Status     *WorkshopStatus `json:"status,omitempty" yaml:"status,omitempty"`
}

type WorkshopSpec struct {
	DisplayName       string              `json:"displayName,omitempty" yaml:"displayName,omitempty"`
	Description       string              `json:"description,omitempty" yaml:"description,omitempty"`
	AccessPassword    string              `json:"accessPassword,omitempty" yaml:"accessPassword,omitempty"`
	MultiuserServices bool                `json:"multiuserServices" yaml:"multiuserServices"`
	OpenRegistration  bool                `json:"openRegistration" yaml:"openRegistration"`
	ProvisionDisabled bool                `json:"provisionDisabled" yaml:"provisionDisabled"`
	Lifespan          *WorkshopLifespan   `json:"lifespan,omitempty" yaml:"lifespan,omitempty"`
	ActionSchedule    *WorkshopSchedule   `json:"actionSchedule,omitempty" yaml:"actionSchedule,omitempty"`
	LabUserInterface  *LabUserInterface   `json:"labUserInterface,omitempty" yaml:"labUserInterface,omitempty"`
}

type WorkshopLifespan struct {
	Start           string `json:"start,omitempty" yaml:"start,omitempty"`
	End             string `json:"end,omitempty" yaml:"end,omitempty"`
	ReadyBy         string `json:"readyBy,omitempty" yaml:"readyBy,omitempty"`
	Maximum         string `json:"maximum,omitempty" yaml:"maximum,omitempty"`
	RelativeMaximum string `json:"relativeMaximum,omitempty" yaml:"relativeMaximum,omitempty"`
}

type WorkshopSchedule struct {
	Start string `json:"start,omitempty" yaml:"start,omitempty"`
	Stop  string `json:"stop,omitempty" yaml:"stop,omitempty"`
}

type LabUserInterface struct {
	Redirect bool `json:"redirect,omitempty" yaml:"redirect,omitempty"`
}

type WorkshopStatus struct {
	UserCount      *WorkshopUserCount     `json:"userCount,omitempty" yaml:"userCount,omitempty"`
	ProvisionCount *WorkshopProvisionCount `json:"provisionCount,omitempty" yaml:"provisionCount,omitempty"`
}

type WorkshopUserCount struct {
	Total     int `json:"total" yaml:"total"`
	Assigned  int `json:"assigned" yaml:"assigned"`
	Available int `json:"available" yaml:"available"`
}

type WorkshopProvisionCount struct {
	Ordered int `json:"ordered" yaml:"ordered"`
	Failed  int `json:"failed" yaml:"failed"`
	Active  int `json:"active" yaml:"active"`
	Retries int `json:"retries" yaml:"retries"`
}

type WorkshopList struct {
	APIVersion string     `json:"apiVersion" yaml:"apiVersion"`
	Kind       string     `json:"kind" yaml:"kind"`
	Metadata   ListMeta   `json:"metadata" yaml:"metadata"`
	Items      []Workshop `json:"items" yaml:"items"`
}

type WorkshopProvision struct {
	APIVersion string                 `json:"apiVersion" yaml:"apiVersion"`
	Kind       string                 `json:"kind" yaml:"kind"`
	Metadata   ObjectMeta             `json:"metadata" yaml:"metadata"`
	Spec       WorkshopProvisionSpec  `json:"spec" yaml:"spec"`
}

type WorkshopProvisionSpec struct {
	WorkshopName string                    `json:"workshopName" yaml:"workshopName"`
	CatalogItem  WorkshopProvisionCatalog  `json:"catalogItem" yaml:"catalogItem"`
	Count        int                       `json:"count" yaml:"count"`
	Concurrency  int                       `json:"concurrency" yaml:"concurrency"`
	StartDelay   int                       `json:"startDelay" yaml:"startDelay"`
	Parameters   map[string]interface{}    `json:"parameters,omitempty" yaml:"parameters,omitempty"`
}

type WorkshopProvisionCatalog struct {
	Name      string `json:"name" yaml:"name"`
	Namespace string `json:"namespace" yaml:"namespace"`
}
