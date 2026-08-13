#!/bin/bash

set -eo pipefail

if [[ -d venv ]]; then
  . ./venv/bin/activate
else
  python -m venv ./venv
  . ./venv/bin/activate
  pip install -r requirements.txt
fi

pip install ../client/python/babylon_async

export OPERATOR_NAMESPACE=babylon-config
# Environment level development or integration, run local should never run on production!
export ENVIRONMENT_LEVEL=$(oc get ingresses.config cluster -o jsonpath={.spec.domain} | grep integration &>/dev/null && echo integration || echo development)
export APP_ROOT=${PWD}/tmp
export RUN_LOCAL=true

. .s2i/bin/assemble

cd ./operator
exec kopf run \
  --standalone \
  --namespace=babylon-config \
  --liveness=http://0.0.0.0:8080/healthz \
  operator.py
