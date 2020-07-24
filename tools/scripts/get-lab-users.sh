#!/bin/sh

TID=$1

UI_POD=$(oc get pod -l app=babylon-events,component=ui -n $TID -o jsonpath='{.items[0].metadata.name}')

for USER_64 in $(oc logs $UI_POD -n $TID | sed -n -re 's/^([^ ]+).*.*\/l\/([^ ]*).* (200|302) .*/\1,\2/p'); do
#38.205.128.135 - - [29/Apr/2020 13:33:12]
    echo $USER_64 | base64 -d 2>/dev/null
    echo
done
# | grep '@' | sort -u
