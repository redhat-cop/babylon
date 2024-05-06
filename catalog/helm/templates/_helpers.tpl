{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "babylonCatalog.name" -}}
  {{- default .Chart.Name .Values.nameOverride | kebabcase | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Name applied to API resources.
*/}}
{{- define "babylonCatalog.apiName" -}}
  {{- default (printf "%s-api" (include "babylonCatalog.name" .)) .Values.api.name -}}
{{- end -}}

{{/*
Create names for the oauth-proxy component
*/}}
{{- define "babylonCatalog.oauthProxyName" -}}
  {{- default (printf "%s-oauth-proxy" (include "babylonCatalog.name" .)) .Values.oauthProxy.name -}}
{{- end -}}
{{- define "babylonCatalog.oauthProxyClientSecretName" -}}
  {{- printf "%s-client" (include "babylonCatalog.oauthProxyName" .) -}}
{{- end -}}
{{- define "babylonCatalog.oauthProxyCookieSecretName" -}}
  {{- printf "%s-cookie" (include "babylonCatalog.oauthProxyName" .) -}}
{{- end -}}

{{/*
Create the name for the redis component
*/}}
{{- define "babylonCatalog.redisName" -}}
  {{- default (printf "%s-redis" (include "babylonCatalog.name" .)) .Values.redis.name -}}
{{- end -}}

{{/*
Name applied to Salesforce Secret
*/}}
{{- define "babylonCatalog.salesforceSecretName" -}}
  {{- default (printf "%s-salesforce-api" (include "babylonCatalog.name" .)) .Values.salesforce.secretName -}}
{{- end -}}

{{/*
Name applied to UI resources.
*/}}
{{- define "babylonCatalog.uiName" -}}
  {{- default (printf "%s-ui" (include "babylonCatalog.name" .)) .Values.ui.name -}}
{{- end -}}

{{/*
Name applied to UI status resources.
*/}}
{{- define "babylonCatalog.statusName" -}}
  {{- default (printf "%s-status" (include "babylonCatalog.name" .)) .Values.status.name -}}
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
Common labels for chart managed resources
*/}}
{{- define "babylonCatalog.labels" -}}
helm.sh/chart: {{ include "babylonCatalog.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/name: {{ include "babylonCatalog.name" . }}
  {{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
  {{- end }}
  {{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
  {{- end -}}
{{- end -}}

{{/*
API Selector labels
*/}}
{{- define "babylonCatalog.apiSelectorLabels" -}}
app.kubernetes.io/name: {{ include "babylonCatalog.name" . }}
app.kubernetes.io/component: api
  {{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
  {{- end -}}
{{- end -}}

{{/*
OAuth Proxy Selector labels
*/}}
{{- define "babylonCatalog.oauthProxySelectorLabels" -}}
app.kubernetes.io/name: {{ include "babylonCatalog.name" . }}
app.kubernetes.io/component: oauth-proxy
  {{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
  {{- end -}}
{{- end -}}

{{/*
Redis Selector labels
*/}}
{{- define "babylonCatalog.redisSelectorLabels" -}}
app.kubernetes.io/name: {{ include "babylonCatalog.name" . }}
app.kubernetes.io/component: redis
  {{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
  {{- end -}}
{{- end -}}

{{/*
UI Selector labels
*/}}
{{- define "babylonCatalog.uiSelectorLabels" -}}
app.kubernetes.io/name: {{ include "babylonCatalog.name" . }}
app.kubernetes.io/component: ui
  {{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
  {{- end -}}
{{- end -}}

{{/*
Status Selector labels
*/}}
{{- define "babylonCatalog.statusSelectorLabels" -}}
app.kubernetes.io/name: {{ include "babylonCatalog.name" . }}
app.kubernetes.io/component: status
  {{- if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
  {{- end -}}
{{- end -}}

{{/*
Image for the catalog api
*/}}
{{- define "babylonCatalog.apiImage" -}}
  {{- if .Values.api.image.override }}
     {{- .Values.api.image.override }}
  {{- else }}
     {{- .Values.api.image.repository }}:{{ .Values.api.image.tag }}
  {{- end }}
{{- end -}}

{{/*
Image for oauth-proxy
*/}}
{{- define "babylonCatalog.oauthProxyImage" -}}
  {{- if .Values.oauthProxy.image.override }}
     {{- .Values.oauthProxy.image.override }}
  {{- else }}
     {{- .Values.oauthProxy.image.repository }}:{{ .Values.oauthProxy.image.tag }}
  {{- end }}
{{- end -}}

{{/*
Image for redis
*/}}
{{- define "babylonCatalog.redisImage" -}}
  {{- if .Values.redis.image.override }}
     {{- .Values.redis.image.override }}
  {{- else }}
     {{- .Values.redis.image.repository }}:{{ .Values.redis.image.tag }}
  {{- end }}
{{- end -}}

{{/*
Image for the catalog ui
*/}}
{{- define "babylonCatalog.uiImage" -}}
  {{- if .Values.ui.image.override }}
     {{- .Values.ui.image.override }}
  {{- else }}
     {{- .Values.ui.image.repository }}:{{ .Values.ui.image.tag }}
  {{- end }}
{{- end -}}

{{/*
Image for the status
*/}}
{{- define "babylonCatalog.statusImage" -}}
  {{- if .Values.status.image.override }}
     {{- .Values.status.image.override }}
  {{- else }}
     {{- .Values.status.image.repository }}:{{ .Values.status.image.tag }}
  {{- end }}
{{- end -}}

{{/*
Create the name of the service account for the API to use
*/}}
{{- define "babylonCatalog.apiServiceAccountName" -}}
  {{- default (include "babylonCatalog.apiName" .) .Values.api.serviceAccount.name }}
{{- end -}}

{{/*
ClusterRole name
*/}}
{{- define "babylonCatalog.apiClusterRoleName" -}}
  {{- include "babylonCatalog.apiName" . }}
{{- end -}}

{{/*
ClusterRoleBinding name
*/}}
{{- define "babylonCatalog.apiClusterRoleBindingName" -}}
  {{- include "babylonCatalog.namespaceName" . }}:{{ include "babylonCatalog.apiServiceAccountName" . }}
{{- end -}}

{{/*
Saleforce API secret name
*/}}
{{- define "babylonCatalog.salesforceApiSecretName" -}}
  {{- .Values.salesforceApi.secretName }}
{{- end -}}