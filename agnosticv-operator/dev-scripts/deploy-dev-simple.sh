#!/bin/bash


set -e

: ${WEBHOOK_SECRET:?"Please set WEBHOOK_SECRET env var"}

#echo "Building webhook-enabled operator..."
#oc start-build babylon-agnosticv-operator --from-dir=.. --follow

echo "Creating/updating webhook secret..."
./create-webhook-secret.sh "$WEBHOOK_SECRET" "github-webhook-secret" "babylon-config"

echo "Getting built image reference..."
IMAGE_REF=$(oc get imagestream babylon-agnosticv-operator -o jsonpath='{.status.tags[?(@.tag=="latest")].items[0].dockerImageReference}')
echo "Built image: $IMAGE_REF"

echo "Deploying webhook-enabled operator (dev)..."

# Stop existing deployment
oc scale deployment babylon-agnosticv-operator --replicas=0 -n babylon-config || true

# Apply dev deployment with webhook
sed "s|IMAGE_PLACEHOLDER|$IMAGE_REF|g" deploy-dev-minimal.yaml | oc apply -f -

echo "Waiting for deployment..."
oc rollout status deployment/babylon-agnosticv-operator-webhook-dev -n babylon-config

echo "Getting webhook URL..."
WEBHOOK_URL=$(oc get route babylon-agnosticv-operator-webhook-dev -n babylon-config -o jsonpath='{.spec.host}')

echo "Webhook URL: https://$WEBHOOK_URL/webhook/github"
echo "Health check: https://$WEBHOOK_URL/health"
echo ""
echo "Configure GitHub webhook:"
echo "  Payload URL: https://$WEBHOOK_URL/webhook/github"
echo "  Content type: application/json"
echo "  Secret: $WEBHOOK_SECRET"
echo "  Events: Just the push event"

echo ""
echo "Testing health endpoint..."
curl -f "https://$WEBHOOK_URL/health" | jq . || echo "Health check failed"

echo ""
echo "Checking operator status..."
oc get pods -l app.kubernetes.io/name=babylon-agnosticv-operator-webhook-dev -n babylon-config
oc logs deployment/babylon-agnosticv-operator-webhook-dev -n babylon-config --tail=10
