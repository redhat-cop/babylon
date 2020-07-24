#!/bin/bash 

namespace=$1
if [ -z "$1" ]; then 
  echo "usage: $0 <namespace>"
  exit -1
fi
delay=5
for rc in $(oc get resourceclaims -n $namespace -o json|jq -r  '.items[].metadata.name'); do
 oc delete resourceclaim -n $namespace $rc
 echo "waiting $delay sec"
 sleep $delay
done
