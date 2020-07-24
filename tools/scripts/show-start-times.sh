#!/bin/sh
oc get deployment --all-namespaces -o custom-columns="DEPLOYMENT:.metadata.name,LAB:.metadata.namespace,START_TIME:.spec.template.spec.containers[0].env[?(@.name=='LAB_START_TIME')].value" | egrep '(LAB|babylon-events-ui)' | sed 's/^[^ ]* *//' | sort -k2
