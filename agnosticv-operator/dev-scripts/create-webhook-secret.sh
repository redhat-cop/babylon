#!/bin/bash

# Helper script to create/update webhook secret
WEBHOOK_SECRET=${1:-"dev-webhook-secret-123"}  # Default dev secret
SECRET_NAME=${2:-"github-webhook-secret"}
NAMESPACE=${3:-"babylon-config"}

echo "Creating/updating webhook secret..."
echo "  Secret: $SECRET_NAME"
echo "  Namespace: $NAMESPACE"
echo "  Value: $WEBHOOK_SECRET"

# Create or update the secret
oc create secret generic "$SECRET_NAME" \
  --from-literal=secret="$WEBHOOK_SECRET" \
  --dry-run=client -o yaml | oc apply -n "$NAMESPACE" -f -

echo "Webhook secret ready!"
echo ""
echo "Use this secret in your AgnosticVRepo:"
echo "spec:"
echo "  gitHub:"
echo "    webhookSecret: $SECRET_NAME"
echo ""
echo "Use this value in GitHub webhook configuration:"
echo "  Secret: $WEBHOOK_SECRET"
