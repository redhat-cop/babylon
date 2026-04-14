package types

type CatalogItem struct {
	APIVersion string          `json:"apiVersion" yaml:"apiVersion"`
	Kind       string          `json:"kind" yaml:"kind"`
	Metadata   ObjectMeta      `json:"metadata" yaml:"metadata"`
	Spec       CatalogItemSpec `json:"spec" yaml:"spec"`
	Status     *CatalogItemStatus `json:"status,omitempty" yaml:"status,omitempty"`
}

type CatalogItemSpec struct {
	DisplayName           string                  `json:"displayName,omitempty" yaml:"displayName,omitempty"`
	Description           *CatalogItemDescription `json:"description,omitempty" yaml:"description,omitempty"`
	Category              string                  `json:"category,omitempty" yaml:"category,omitempty"`
	Keywords              []string                `json:"keywords,omitempty" yaml:"keywords,omitempty"`
	Parameters            []CatalogItemParameter  `json:"parameters,omitempty" yaml:"parameters,omitempty"`
	Lifespan              *LifespanSpec           `json:"lifespan,omitempty" yaml:"lifespan,omitempty"`
	Runtime               *RuntimeSpec            `json:"runtime,omitempty" yaml:"runtime,omitempty"`
	ExternalURL           string                  `json:"externalUrl,omitempty" yaml:"externalUrl,omitempty"`
	TermsOfService        string                  `json:"termsOfService,omitempty" yaml:"termsOfService,omitempty"`
	ProvisionTimeEstimate string                  `json:"provisionTimeEstimate,omitempty" yaml:"provisionTimeEstimate,omitempty"`
	Resources             []interface{}           `json:"resources,omitempty" yaml:"resources,omitempty"`
	Bookbag               interface{}             `json:"bookbag,omitempty" yaml:"bookbag,omitempty"`
	MessageTemplates      *MessageTemplates       `json:"messageTemplates,omitempty" yaml:"messageTemplates,omitempty"`
	UserData              interface{}             `json:"userData,omitempty" yaml:"userData,omitempty"`
	WorkshopUiDisabled    bool                    `json:"workshopUiDisabled,omitempty" yaml:"workshopUiDisabled,omitempty"`
	WorkshopUserMode      string                  `json:"workshopUserMode,omitempty" yaml:"workshopUserMode,omitempty"`
}

type MessageTemplates struct {
	Info interface{} `json:"info,omitempty" yaml:"info,omitempty"`
	User interface{} `json:"user,omitempty" yaml:"user,omitempty"`
}

type CatalogItemDescription struct {
	Content string `json:"content,omitempty" yaml:"content,omitempty"`
	Format  string `json:"format,omitempty" yaml:"format,omitempty"`
}

type CatalogItemParameter struct {
	Name            string      `json:"name" yaml:"name"`
	Description     string      `json:"description,omitempty" yaml:"description,omitempty"`
	FormLabel       string      `json:"formLabel,omitempty" yaml:"formLabel,omitempty"`
	FormGroup       string      `json:"formGroup,omitempty" yaml:"formGroup,omitempty"`
	Required        bool        `json:"required,omitempty" yaml:"required,omitempty"`
	Value           string      `json:"value,omitempty" yaml:"value,omitempty"`
	Variable        string      `json:"variable,omitempty" yaml:"variable,omitempty"`
	OpenAPIV3Schema *SchemaSpec `json:"openAPIV3Schema,omitempty" yaml:"openAPIV3Schema,omitempty"`
	Annotation      string      `json:"annotation,omitempty" yaml:"annotation,omitempty"`
	Validation      string      `json:"validation,omitempty" yaml:"validation,omitempty"`
}

type SchemaSpec struct {
	Type    string      `json:"type,omitempty" yaml:"type,omitempty"`
	Default interface{} `json:"default,omitempty" yaml:"default,omitempty"`
	Enum    []interface{} `json:"enum,omitempty" yaml:"enum,omitempty"`
}

type LifespanSpec struct {
	Default         string `json:"default,omitempty" yaml:"default,omitempty"`
	Maximum         string `json:"maximum,omitempty" yaml:"maximum,omitempty"`
	RelativeMaximum string `json:"relativeMaximum,omitempty" yaml:"relativeMaximum,omitempty"`
	End             string `json:"end,omitempty" yaml:"end,omitempty"`
	Start           string `json:"start,omitempty" yaml:"start,omitempty"`
}

type RuntimeSpec struct {
	Default string `json:"default,omitempty" yaml:"default,omitempty"`
	Maximum string `json:"maximum,omitempty" yaml:"maximum,omitempty"`
}

type CatalogItemStatus struct {
	Rating float64 `json:"rating,omitempty" yaml:"rating,omitempty"`
}

type CatalogItemList struct {
	APIVersion string        `json:"apiVersion" yaml:"apiVersion"`
	Kind       string        `json:"kind" yaml:"kind"`
	Metadata   ListMeta      `json:"metadata" yaml:"metadata"`
	Items      []CatalogItem `json:"items" yaml:"items"`
}
