package types

// K8s-compatible types without importing k8s.io/apimachinery to keep binary small.

type ObjectMeta struct {
	Name              string            `json:"name,omitempty" yaml:"name,omitempty"`
	Namespace         string            `json:"namespace,omitempty" yaml:"namespace,omitempty"`
	Labels            map[string]string `json:"labels,omitempty" yaml:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty" yaml:"annotations,omitempty"`
	CreationTimestamp  string            `json:"creationTimestamp,omitempty" yaml:"creationTimestamp,omitempty"`
	DeletionTimestamp  string            `json:"deletionTimestamp,omitempty" yaml:"deletionTimestamp,omitempty"`
	ResourceVersion   string            `json:"resourceVersion,omitempty" yaml:"resourceVersion,omitempty"`
	UID               string            `json:"uid,omitempty" yaml:"uid,omitempty"`
	GenerateName      string            `json:"generateName,omitempty" yaml:"generateName,omitempty"`
	OwnerReferences   []OwnerReference  `json:"ownerReferences,omitempty" yaml:"ownerReferences,omitempty"`
}

type OwnerReference struct {
	APIVersion string `json:"apiVersion" yaml:"apiVersion"`
	Kind       string `json:"kind" yaml:"kind"`
	Name       string `json:"name" yaml:"name"`
	UID        string `json:"uid" yaml:"uid"`
	Controller *bool  `json:"controller,omitempty" yaml:"controller,omitempty"`
}

type ObjectReference struct {
	APIVersion string `json:"apiVersion" yaml:"apiVersion"`
	Kind       string `json:"kind" yaml:"kind"`
	Name       string `json:"name" yaml:"name"`
	Namespace  string `json:"namespace" yaml:"namespace"`
	UID        string `json:"uid,omitempty" yaml:"uid,omitempty"`
}

type ListMeta struct {
	Continue string `json:"continue,omitempty" yaml:"continue,omitempty"`
}

// Domain constants used throughout Babylon.
const (
	BabylonDomain = "babylon.gpte.redhat.com"
	DemoDomain    = "demo.redhat.com"
	PoolboyDomain = "poolboy.gpte.redhat.com"
)
