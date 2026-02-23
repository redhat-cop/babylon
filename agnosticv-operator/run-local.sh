#!/bin/bash

set -eo pipefail

export OPERATOR_NAMESPACE=babylon-config
export APP_ROOT=${PWD}/tmp
export RUN_LOCAL=true

. .s2i/bin/assemble

cd ./operator
exec kopf run \
  --standalone \
  --namespace=babylon-config \
  --liveness=http://0.0.0.0:8080/healthz \
  operator.py
