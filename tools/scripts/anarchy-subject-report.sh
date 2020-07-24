#!/bin/sh
oc get anarchysubject -n anarchy-operator -o 'custom-columns=LAB:.metadata.annotations.poolboy\.gpte\.redhat\.com/resource-claim-namespace,CLAIM:.metadata.annotations.poolboy\.gpte\.redhat\.com/resource-claim-name,SUBJECT:.metadata.name,CREATED:.metadata.creationTimestamp,DEPLOY:.status.towerJobs.provision.deployerJob,COMPLETE:.status.towerJobs.provision.completeTimestamp'
