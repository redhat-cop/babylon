#!/bin/sh

LAB_CODE="$1"

if [[ -z "${LAB_CODE}" ]]; then
  echo "Usage: $0 <LAB_CODE>" >&2
  exit 1
fi

sed -nr 's/^([^\t]*).*\t'$LAB_CODE'\t.*/\1/p' lab-emails.csv
