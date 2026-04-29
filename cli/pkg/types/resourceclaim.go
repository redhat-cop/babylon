package types

import "encoding/json"

type ResourceClaim struct {
	APIVersion string               `json:"apiVersion" yaml:"apiVersion"`
	Kind       string               `json:"kind" yaml:"kind"`
	Metadata   ObjectMeta           `json:"metadata" yaml:"metadata"`
	Spec       ResourceClaimSpec    `json:"spec" yaml:"spec"`
	Status     *ResourceClaimStatus `json:"status,omitempty" yaml:"status,omitempty"`
}

type ResourceClaimSpec struct {
	Provider   *ResourceClaimProvider  `json:"provider,omitempty" yaml:"provider,omitempty"`
	Lifespan   *ResourceClaimLifespan  `json:"lifespan,omitempty" yaml:"lifespan,omitempty"`
	Resources  []ResourceClaimResource `json:"resources,omitempty" yaml:"resources,omitempty"`
	AutoDetach *AutoDetach             `json:"autoDetach,omitempty" yaml:"autoDetach,omitempty"`
}

type ResourceClaimProvider struct {
	Name            string                 `json:"name" yaml:"name"`
	ParameterValues map[string]interface{} `json:"parameterValues,omitempty" yaml:"parameterValues,omitempty"`
}

type ResourceClaimLifespan struct {
	End   string `json:"end,omitempty" yaml:"end,omitempty"`
	Start string `json:"start,omitempty" yaml:"start,omitempty"`
}

type AutoDetach struct {
	When string `json:"when" yaml:"when"`
}

type ResourceClaimResource struct {
	Name     string           `json:"name,omitempty" yaml:"name,omitempty"`
	Provider *ObjectReference `json:"provider,omitempty" yaml:"provider,omitempty"`
	Template json.RawMessage  `json:"template,omitempty" yaml:"template,omitempty"`
}

type ResourceClaimStatus struct {
	Summary        *ResourceClaimSummary        `json:"summary,omitempty" yaml:"summary,omitempty"`
	ResourceHandle *ObjectReference             `json:"resourceHandle,omitempty" yaml:"resourceHandle,omitempty"`
	Resources      []ResourceHandleResource     `json:"resources,omitempty" yaml:"resources,omitempty"`
	Lifespan       *ResourceClaimLifespanStatus `json:"lifespan,omitempty" yaml:"lifespan,omitempty"`
	Provider       *ResourceClaimProvider       `json:"provider,omitempty" yaml:"provider,omitempty"`
}

type ResourceClaimSummary struct {
	State          string                 `json:"state,omitempty" yaml:"state,omitempty"`
	RuntimeDefault string                 `json:"runtime_default,omitempty" yaml:"runtime_default,omitempty"`
	RuntimeMaximum string                 `json:"runtime_maximum,omitempty" yaml:"runtime_maximum,omitempty"`
	ErrorMessage   string                 `json:"error_message,omitempty" yaml:"error_message,omitempty"`
	ProvisionData  map[string]interface{} `json:"provision_data,omitempty" yaml:"provision_data,omitempty"`
}

type ResourceClaimLifespanStatus struct {
	Default         string `json:"default,omitempty" yaml:"default,omitempty"`
	End             string `json:"end,omitempty" yaml:"end,omitempty"`
	Maximum         string `json:"maximum,omitempty" yaml:"maximum,omitempty"`
	RelativeMaximum string `json:"relativeMaximum,omitempty" yaml:"relativeMaximum,omitempty"`
	Start           string `json:"start,omitempty" yaml:"start,omitempty"`
}

type ResourceHandleResource struct {
	Name     string           `json:"name,omitempty" yaml:"name,omitempty"`
	Provider *ObjectReference `json:"provider,omitempty" yaml:"provider,omitempty"`
	State    *AnarchySubject  `json:"state,omitempty" yaml:"state,omitempty"`
}

type AnarchySubject struct {
	APIVersion string              `json:"apiVersion,omitempty" yaml:"apiVersion,omitempty"`
	Kind       string              `json:"kind,omitempty" yaml:"kind,omitempty"`
	Metadata   ObjectMeta          `json:"metadata,omitempty" yaml:"metadata,omitempty"`
	Spec       AnarchySubjectSpec  `json:"spec,omitempty" yaml:"spec,omitempty"`
	Status     *AnarchySubjectStatus `json:"status,omitempty" yaml:"status,omitempty"`
}

type AnarchySubjectSpec struct {
	Governor string              `json:"governor,omitempty" yaml:"governor,omitempty"`
	Vars     *AnarchySubjectVars `json:"vars,omitempty" yaml:"vars,omitempty"`
}

type AnarchySubjectVars struct {
	CurrentState      string                 `json:"current_state,omitempty" yaml:"current_state,omitempty"`
	DesiredState      string                 `json:"desired_state,omitempty" yaml:"desired_state,omitempty"`
	ActionSchedule    *AnarchyActionSchedule `json:"action_schedule,omitempty" yaml:"action_schedule,omitempty"`
	Healthy           *bool                  `json:"healthy,omitempty" yaml:"healthy,omitempty"`
	ProvisionData     map[string]interface{} `json:"provision_data,omitempty" yaml:"provision_data,omitempty"`
	ProvisionMessages []string               `json:"provision_messages,omitempty" yaml:"provision_messages,omitempty"`
	StatusMessages    []string               `json:"status_messages,omitempty" yaml:"status_messages,omitempty"`
	JobVars           *JobVars               `json:"job_vars,omitempty" yaml:"job_vars,omitempty"`
}

type JobVars struct {
	GUID string `json:"guid,omitempty" yaml:"guid,omitempty"`
	UUID string `json:"uuid,omitempty" yaml:"uuid,omitempty"`
}

type AnarchyActionSchedule struct {
	DefaultRuntime string `json:"default_runtime,omitempty" yaml:"default_runtime,omitempty"`
	MaximumRuntime string `json:"maximum_runtime,omitempty" yaml:"maximum_runtime,omitempty"`
	Start          string `json:"start,omitempty" yaml:"start,omitempty"`
	Stop           string `json:"stop,omitempty" yaml:"stop,omitempty"`
}

type AnarchySubjectStatus struct {
	SupportedActions map[string]interface{}       `json:"supportedActions,omitempty" yaml:"supportedActions,omitempty"`
	TowerJobs        map[string]AnarchyTowerJob   `json:"towerJobs,omitempty" yaml:"towerJobs,omitempty"`
}

type AnarchyTowerJob struct {
	TowerJobURL       string `json:"towerJobURL,omitempty" yaml:"towerJobURL,omitempty"`
	StartTimestamp    string `json:"startTimestamp,omitempty" yaml:"startTimestamp,omitempty"`
	CompleteTimestamp string `json:"completeTimestamp,omitempty" yaml:"completeTimestamp,omitempty"`
}

type ResourceClaimList struct {
	APIVersion string          `json:"apiVersion" yaml:"apiVersion"`
	Kind       string          `json:"kind" yaml:"kind"`
	Metadata   ListMeta        `json:"metadata" yaml:"metadata"`
	Items      []ResourceClaim `json:"items" yaml:"items"`
}
