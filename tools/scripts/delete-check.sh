#!/bin/sh
oc get anarchysubject -n anarchy-operator -o custom-columns='NAME:.metadata.name,CREATE:.metadata.creationTimestamp,DELETE:.metadata.deletionTimestamp,DESTROY_JOB:.status.towerJobs.destroy.deployerJob' | grep -v '<none> *<none>'
