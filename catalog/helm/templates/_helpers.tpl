{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "babylonCatalog.name" -}}
  {{- default .Chart.Name .Values.nameOverride | kebabcase | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "babylonCatalog.chart" -}}
{{-   printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create the name of the namespace to use
*/}}
{{- define "babylonCatalog.namespaceName" -}}
  {{- default (include "babylonCatalog.name" .) .Values.namespace.name -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "babylonCatalog.labels" -}}
helm.sh/chart: {{ include "babylonCatalog.chart" . }}
{{ include "babylonCatalog.selectorLabels" . }}
  {{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
  {{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "babylonCatalog.selectorLabels" -}}
app.kubernetes.io/name: {{ include "babylonCatalog.name" . }}
  {{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
  {{- end -}}
{{- end -}}

{{/*
Image for the catalog ui
*/}}
{{- define "babylonCatalog.image" -}}
  {{- if .Values.image.override }}
     {{- .Values.image.override }}
  {{- else }}
     {{- .Values.image.repository }}:v{{ .Chart.AppVersion }}
  {{- end }}
{{- end -}}

{{/*
Create the name of the service account to use
*/}}
{{- define "babylonCatalog.serviceAccountName" -}}
  {{- default (include "babylonCatalog.name" .) .Values.serviceAccount.name }}
{{- end -}}

{{/*
ClusterRole name
*/}}
{{- define "babylonCatalog.clusterRoleName" -}}
  {{- include "babylonCatalog.name" . }}
{{- end -}}

{{/*
ClusterRoleBinding name
*/}}
{{- define "babylonCatalog.clusterRoleBindingName" -}}
  {{- include "babylonCatalog.namespaceName" . }}:{{ include "babylonCatalog.name" . }}
{{- end -}}

{{/*
Create the name for the redis component
*/}}
{{- define "babylonCatalog.redisName" -}}
  {{- if .Values.redis.name }}
    {{- .Values.redis.name }}
  {{- else }}
    {{- include "babylonCatalog.name" . }}-redis
  {{- end }}
{{- end -}}

{{/*
Redis Selector labels
*/}}
{{- define "babylonCatalog.redisSelectorLabels" -}}
app.kubernetes.io/name: {{ include "babylonCatalog.redisName" . }}
  {{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
  {{- end -}}
{{- end -}}
