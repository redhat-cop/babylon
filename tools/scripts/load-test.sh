#!/bin/bash

usage() {
    echo "$0 TEMPLATE NAMESPACE COUNT ACTION [DELAY] [BATCH]"
    echo
    echo "TEMPLATE: ex: gpte//event.rhs-2020-t2f8c0.prod"
    echo
    echo "NAMESPACE: the namespace the resourceclaims will be created in"
    echo "           Use one namespace per load-test."
    echo
    echo "COUNT: the number of environments to provision / destroy"
    echo
    echo "ACTION: provision | destroy"
    echo
    echo "DELAY: default=10 (optional)"
    echo
    echo "BATCH: default=1  number of simultanous provisions"
    echo
    echo EXAMPLES
    echo "$0 gpte//event.rhs-2020-LABCODE.prod LABCODE 65 provision"
    echo "with a 2min delay between each provision:"
    echo "$0 gpte//event.rhs-2020-LABCODE.prod LABCODE-prod 65 provision 120"
    echo "$0 gpte//event.rhs-2020-LABCODE.prod LABCODE-prod 65 provision"
    echo "$0 gpte//event.rhs-2020-LABCODE.prod LABCODE-prod 65 watch"
    echo "$0 gpte//event.rhs-2020-LABCODE.prod LABCODE 65 destroy"
    echo "batch of 2 with 5m delay:"
    echo "$0 gpte//event.rhs-2020-t2f8c0.prod t2f8c0 10 provision 300 2"
    echo
}


if [ "$#" -lt 4 ] || [ "$#" -gt 6 ]; then
    usage
    exit 2
fi

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

template=$1
namespace=$2
count=$3
action=$4
delay=${5:-10}
batch=${6:-1}
#user=gucore-redhat.com
user=system:admin
labcode=$(echo "${template}"|cut -d'.' -f2|perl -pe 's/.*-([^-]+)$/$1/')

ALLARGS="$*"

annotate() {
  msg="${1}"
  read -r -d '' postdata << EOM
    {"text": "${labcode} x ${count} ${msg}",
     "tags":["${labcode}","summit2020"]
    }
EOM

  timeout 10 curl -s \
    -H "Authorization: Bearer eyJrIjoia3VtNzR0UFd3dWNhVVo1bjhNRjdxS0F0NWV6aTRlZDAiLCJuIjoiYXBpX292ZXJ3YXRjaCIsImlkIjoxfQ==" \
    http://overwatch.osp.opentlc.com:3000/api/annotations \
    -H "Content-Type: application/json" -d "$postdata"
  echo
}


provision() {
    annotate "Load Test Running $ALLARGS"
    for i in $(seq $((count/batch))); do
        for b in $(seq $batch); do
            oc process $template | oc create -n $namespace --as $user -f - &
        done
        sleep ${delay}
    done

    # do the rest (integer division have a rest)
    # for example if we try to do 65 by batch of 3, the last batch will have 2.
    # this is the purpose of this loop.
    for i in $(seq $((count - count/batch * batch))); do
	    oc process $template | oc create -n $namespace --as $user -f - &
    done

    wait
}

wait_for_all_started() {
    n=0
    echo -n "waiting for all deployments to start in tower"
    number_of_claims=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].metadata.name" | grep -v null | wc -l)
    while [ "$n" -lt $number_of_claims ]; do
        n=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].status.resources[].state.status.towerJobs.provision.launchTimestamp" | grep -v null | wc -l)
        echo -n ".${n}"
        sleep 2
        # update number of claims
	number_of_claims=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].metadata.name" | grep -v null | wc -l)
    done
    echo
}
first_and_last_started() {
    all_creation=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].metadata.creationTimestamp" | grep -v null | sort)
    all=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].status.resources[].state.status.towerJobs.provision.launchTimestamp" | grep -v null | sort)

    first_started=$(date --date $(echo "${all}"|head -n 1) +%s)
    first_created=$(date --date $(echo "${all_creation}"|head -n 1) +%s)
    last_started=$(date --date $(echo "${all}"|tail -n 1) +%s)
    last_created=$(date --date $(echo "${all_creation}"|tail -n 1) +%s)
}

first_and_last_finished() {
    all=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].status.resources[].state.status.towerJobs.provision.completeTimestamp" | grep -v null | sort)

    first_finished=$(date --date $(echo "${all}"|head -n 1) +%s)
    last_finished=$(date --date $(echo "${all}"|tail -n 1) +%s)
}

wait_for_all_finished() {
    n=0
    echo -n "waiting for all deployments to finish in tower"

    number_of_claims=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].metadata.name" | grep -v null | wc -l)
    while [ "$n" -lt $number_of_claims ]; do
        n=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].status.resources[].state.status.towerJobs.provision.completeTimestamp" | grep -v null | wc -l)
        echo -n ".${n}"
        sleep 2
        number_of_claims=$(oc get resourceclaims -n $namespace -o json|jq -r ".items[].metadata.name" | grep -v null | wc -l)
    done
    echo
}

oc project ${namespace}
if [ $? != 0 ]; then
    echo "Does project ${namespace} exist ?"
    exit 2
fi

start=$(date +%s)

case "${action}" in
    provision)
        provision
        ;;
    watch)
        wait_for_all_started
        wait_for_all_finished
        first_and_last_started
        first_and_last_finished
        end=$(date +%s)
        echo "All started after    $((last_started - first_created)) seconds"
        echo "First started after  $((first_started - first_created)) seconds"
        echo "Last started after   $((last_started - first_created)) seconds"
        echo "First finished after $((first_finished - first_created)) seconds"
        echo "Last finished after  $((last_finished - first_created)) seconds"
        echo "Total duration:      $((end - start)) seconds"
        ;;
    destroy)
        echo "Are you sure ? If yes run the following:"
        echo
        echo "destroy-namespace.sh ${namespace}"
        ;;
esac
