#!/bin/bash

set -eo pipefail

cd ./operator

exec kopf run \
  --standalone \
  --all-namespaces \
  --liveness=http://0.0.0.0:8080/healthz \
  operator.py
