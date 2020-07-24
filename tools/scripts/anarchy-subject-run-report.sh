#!/bin/bash

SUBJECT=$1

if [[ -z "${SUBJECT}" ]]; then
  echo "Usage $0 <SUBJECT>" >&2
  exit 1
fi

oc get anarchyrun -n anarchy-operator -l "anarchy.gpte.redhat.com/subject=$SUBJECT" -o custom-columns="NAME:.metadata.name,ACTION:.metadata.labels['anarchy\\.gpte\\.redhat\\.com/action'],EVENT:.metadata.labels['anarchy\\.gpte\\.redhat\\.com/event'],DATETIME:.metadata.creationTimestamp"
