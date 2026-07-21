#!/bin/bash

set -eo pipefail

if [[ -d venv ]]; then
  . ./venv/bin/activate
else
  python -m venv ./venv
  . ./venv/bin/activate
  pip install -r requirements.txt
fi

cp -a ../client/python/babylon_async/src/babylon_async venv/lib/python3.*/site-packages/

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
