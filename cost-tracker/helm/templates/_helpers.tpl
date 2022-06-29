{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "babylon-cost-tracker.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "babylon-cost-tracker.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "babylon-cost-tracker.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "babylon-cost-tracker.labels" -}}
helm.sh/chart: {{ include "babylon-cost-tracker.chart" . }}
{{ include "babylon-cost-tracker.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "babylon-cost-tracker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "babylon-cost-tracker.name" . }}
{{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- end -}}

{{/*
Create the name of the service account to use
*/}}
{{- define "babylon-cost-tracker.awsSandboxManagerSecretName" -}}
{{- include "babylon-cost-tracker.name" . -}}-aws-sandbox-manager
{{- end -}}

{{/*
Create the name of the service account to use
*/}}
{{- define "babylon-cost-tracker.serviceAccountName" -}}
  {{- if .Values.serviceAccount.create -}}
    {{- default (include "babylon-cost-tracker.name" .) .Values.serviceAccount.name -}}
  {{- else -}}
    {{- default "default" .Values.serviceAccount.name -}}
  {{- end -}}
{{- end -}}

{{/*
Create the name of the namespace to use
*/}}
{{- define "babylon-cost-tracker.namespaceName" -}}
  {{- default (include "babylon-cost-tracker.name" .) .Values.namespace.name }}
{{- end -}}


{{/*
Define the image to deploy
*/}}
{{- define "babylon-cost-tracker.image" -}}
  {{- if .Values.image.override -}}
    {{- .Values.image.override -}}
  {{- else -}}
    {{- if eq .Values.image.tagOverride "-" -}}
      {{- .Values.image.repository -}}
    {{- else if .Values.image.tagOverride -}}
      {{- printf "%s:%s" .Values.image.repository .Values.image.tagOverride -}}
    {{- else -}}
      {{- printf "%s:v%s" .Values.image.repository .Chart.AppVersion -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
