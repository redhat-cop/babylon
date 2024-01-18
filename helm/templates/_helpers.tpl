{{/* vim: set filetype=mustache: */}}
{{- define "babylon.name" -}}
{{-   default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "babylon.chart" -}}
{{-   printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "babylon.labels" -}}
helm.sh/chart: {{ include "babylon.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/name: {{ include "babylon.name" . }}
{{-   if (ne (.Release.Name | upper) "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{-   end -}}
{{-   if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{-   end }}
{{- end -}}

{{- define "babylon.selectorLabels" -}}
app.kubernetes.io/name: {{ include "babylon.name" . }}
{{-   if (ne (.Release.Name | upper) "RELEASE-NAME") }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{-   end -}}
{{- end -}}
