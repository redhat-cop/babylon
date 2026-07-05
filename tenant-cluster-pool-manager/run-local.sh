#!/bin/bash

set -eo pipefail

if [[ -d venv ]]; then
  . ./venv/bin/activate
else
  python -m venv ./venv
  . ./venv/bin/activate
  pip install -r requirements.txt
fi

cp -a ../client/python/babylon_async/src/babylon_async venv/lib/python3.14/site-packages/

oc get clusterkopfpeering.kopf.dev babylon-tenant-cluster-pool-manager >/dev/null 2>&1 ||  oc create -f - <<EOF
apiVersion: kopf.dev/v1
kind: ClusterKopfPeering
metadata:
  name: babylon-tenant-cluster-pool-manager
EOF

cd ./operator

export SANDBOX_API_AUTH_TOKEN=$(oc get secret -n babylon-catalog sandbox-api-shared-cluster-manager -o jsonpath={.data.shared-cluster-manager-token} | base64 -d)

exec kopf run \
  --all-namespaces \
  --liveness=http://0.0.0.0:8080/healthz \
  --peering=babylon-tenant-cluster-pool-manager \
  --debug \
  operator.py
