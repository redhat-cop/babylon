{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "babylon-notifier.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "babylon-notifier.fullname" -}}
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
{{- define "babylon-notifier.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "babylon-notifier.labels" -}}
helm.sh/chart: {{ include "babylon-notifier.chart" . }}
{{ include "babylon-notifier.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "babylon-notifier.selectorLabels" -}}
app.kubernetes.io/name: {{ include "babylon-notifier.name" . }}
{{-   if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{-   end -}}
{{- end -}}

{{/*
Create the name of the service account to use
*/}}
{{- define "babylon-notifier.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
    {{ default (include "babylon-notifier.name" .) .Values.serviceAccount.name }}
{{- else -}}
    {{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Create the name of the namespace to use
*/}}
{{- define "babylon-notifier.namespaceName" -}}
  {{- default (include "babylon-notifier.name" .) .Values.namespace.name }}
{{- end -}}


{{/*
Define the image to deploy
*/}}
{{- define "babylon-notifier.image" -}}
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

{{/*
Create the name for the redis component
*/}}
{{- define "babylon-notifier.redisName" -}}
  {{- default (printf "%s-redis" (include "babylon-notifier.name" .)) .Values.redis.name -}}
{{- end -}}

{{- define "babylon-notifier.redisSelectorLabels" -}}
app.kubernetes.io/name: {{ include "babylon-notifier.name" . }}-redis
{{-   if (ne .Release.Name "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{-   end -}}
{{- end -}}

{{/*
Image for redis
*/}}
{{- define "babylon-notifier.redisImage" -}}
  {{- if .Values.redis.image.override }}
     {{- .Values.redis.image.override }}
  {{- else }}
     {{- .Values.redis.image.repository }}:{{ .Values.redis.image.tag }}
  {{- end }}
{{- end -}}

{{/*
Generate SMTP secret name if not defined
*/}}
{{- define "babylon-notifier.smtpSecret" -}}
  {{- if .Values.smtp.account.secretName }}
    {{- .Values.smtp.account.secretName }}
  {{- else }}
    {{- include "babylon-notifier.name" . }}-smtp-credentials
  {{- end }}
{{- end -}}