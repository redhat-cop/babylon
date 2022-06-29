#!/usr/bin/env python3

import kopf
import kubernetes
import logging
import os

from cost_tracker_state import CostTrackerState
from infinite_relative_backoff import InfiniteRelativeBackoff
from resource_claim import ResourceClaim

babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')

cost_tracker_annotation = f"{babylon_domain}/cost-tracker"

if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
    kubernetes.config.load_incluster_config()
else:
    kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()

def set_cost_tracker_annotation(cost_tracker_state, resource_claim):
    custom_objects_api.patch_namespaced_custom_object(
        poolboy_domain,
        poolboy_api_version,
        resource_claim.namespace,
        'resourceclaims',
        resource_claim.name,
        {
            "metadata": {
                "annotations": {
                    cost_tracker_annotation: cost_tracker_state.serialize(),
                }
            }
        }
    )

@kopf.on.startup()
def configure(settings: kopf.OperatorSettings, **_):
    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for CustomResourceDefinitions
    settings.scanning.disabled = True

@kopf.on.event(poolboy_domain, poolboy_api_version, 'resourceclaims')
def resourceclaim_event(event, logger, **_):
    resource_claim_definition = event.get('object')
    if not resource_claim_definition \
    or resource_claim_definition.get('kind') != 'ResourceClaim':
        logger.warning(event)
        return

    resource_claim = ResourceClaim(definition=resource_claim_definition)
    if not resource_claim.supports_cost_tracking:
        return

    cost_tracker_json = resource_claim.annotations.get(cost_tracker_annotation)
    if not cost_tracker_json:
        set_cost_tracker_annotation(cost_tracker_state=CostTrackerState(), resource_claim=resource_claim)
        logger.info("Created cost tracker annotation")
        return

    cost_tracker_state = CostTrackerState.deserialize(cost_tracker_json)
    if cost_tracker_state.update_is_requested:
        resource_claim.update_cost_tracker_state(cost_tracker_state)
        set_cost_tracker_annotation(cost_tracker_state=cost_tracker_state, resource_claim=resource_claim)
        logger.info(f"Updated estimated cost ${cost_tracker_state.estimated_cost:.2f}")


#    /usr/local/bin/aws --profile #{sandbox} ce get-cost-and-usage --time-period Start=#{startDate},End=#{endDate} --granularity DAILY --metrics UnblendedCost --output json --no-cli-pager --filter file:///usr/local/etc/cost_usage_filter.json
#[prutledg@demo00 ~]$ cat /usr/local/etc/cost_usage_filter.json
#{{
#
#{ "Dimensions": \{ "Key": "RECORD_TYPE", "Values": [ "SavingsPlanCoveredUsage", "Usage" ] }
#}}}
#  costInfo = JSON.parse(jsonOut)
#  costText = ""
#  if costInfo['ResultsByTime'].respond_to?(:each)
#    unblendedCost = 0
#    count = 1
#    costInfo['ResultsByTime'].each do | result |
#      unblendedCost += result['Total']['UnblendedCost']['Amount'].to_f
#      count += 1
#    end
#    avgUnblendedCost = unblendedCost / count
#    costText += "Total cost so far: $#{unblendedCost.to_d.truncate(2).to_s}\n"
#    costText += "Daily average cost: $#{avgUnblendedCost.to_d.truncate(2).to_s}\n"
#  else
#    costText += "Unable to get costs for this service."
#  end
