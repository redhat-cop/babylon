{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "babylon-ratings.apiName" -}}
{{- default (printf "%s-api" (include "babylon-ratings.name" .)) .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "babylon-ratings.operatorName" -}}
{{- default (printf "%s-operator" (include "babylon-ratings.name" .)) .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "babylon-ratings.fullname" -}}
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
{{- define "babylon-ratings.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "babylon-ratings.labels" -}}
helm.sh/chart: {{ include "babylon-ratings.chart" . }}
{{ include "babylon-ratings.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "babylon-ratings.selectorLabels" -}}
app.kubernetes.io/name: {{ include "babylon-ratings.name" . }}
{{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- end -}}

{{- define "babylon-ratings.apiSelectorLabels" -}}
app.kubernetes.io/name: {{ include "babylon-ratings.name" . }}-api
{{-   if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{-   end -}}
{{- end -}}

{{/*
Create the name of the service account to use
*/}}
{{- define "babylon-ratings.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{ default (include "babylon-ratings.name" .) .Values.serviceAccount.name }}
{{- else -}}
{{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Create the name of the namespace to use
*/}}
{{- define "babylon-ratings.namespaceName" -}}
{{- default (include "babylon-ratings.name" .) .Values.namespace.name }}
{{- end -}}


{{/*
Define the API image to deploy
*/}}
{{- define "babylon-ratings.api-image" -}}
  {{- if .Values.api-image.override -}}
    {{- .Values.api-image.override -}}
  {{- else -}}
    {{- if eq .Values.api-image.tagOverride "-" -}}
      {{- .Values.api-image.repository -}}
    {{- else if .Values.api-image.tagOverride -}}
      {{- printf "%s:%s" .Values.api-image.repository .Values.api-image.tagOverride -}}
    {{- else -}}
      {{- printf "%s:v%s" .Values.api-image.repository .Chart.AppVersion -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{/*
Define the Operator image to deploy
*/}}
{{- define "babylon-ratings.operator-image" -}}
  {{- if .Values.operator-image.override -}}
    {{- .Values.operator-image.override -}}
  {{- else -}}
    {{- if eq .Values.operator-image.tagOverride "-" -}}
      {{- .Values.operator-image.repository -}}
    {{- else if .Values.operator-image.tagOverride -}}
      {{- printf "%s:%s" .Values.operator-image.repository .Values.operator-image.tagOverride -}}
    {{- else -}}
      {{- printf "%s:v%s" .Values.operator-image.repository .Chart.AppVersion -}}
    {{- end -}}
  {{- end -}}
{{- end -}}