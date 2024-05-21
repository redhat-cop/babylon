import React, { useEffect, useReducer } from 'react';
import { Link } from 'react-router-dom';
import yaml from 'js-yaml';
import {
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Tooltip,
  TextInput,
} from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import {
  apiFetch,
  apiPaths,
  checkSalesforceId,
  fetcher,
  fetcherItemsInAllPages,
  patchWorkshopProvision,
  patchResourceClaim,
} from '@app/api';
import { CatalogItem, ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { BABYLON_DOMAIN, compareK8sObjectsArr, DEMO_DOMAIN, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import PatientNumberInput from '@app/components/PatientNumberInput';
import useSession from '@app/utils/useSession';
import useSWR, { useSWRConfig } from 'swr';
import useDebounce from '@app/utils/useDebounce';

function reducer(
  state: { salesforce_id: string; valid: boolean; completed: boolean },
  action: { type: 'set_salesforceId' | 'complete'; salesforceId?: string; salesforceIdValid?: boolean }
) {
  switch (action.type) {
    case 'set_salesforceId':
      return {
        salesforce_id: action.salesforceId,
        valid: false,
        completed: false,
      };
    case 'complete':
      return {
        ...state,
        valid: action.salesforceIdValid,
        completed: true,
      };
  }
}

const WorkshopsItemProvisioningItem: React.FC<{
  workshop: Workshop;
  workshopProvision: WorkshopProvision;
  serviceNamespaceName: string;
}> = ({ workshop, workshopProvision, serviceNamespaceName }) => {
  const { isAdmin } = useSession().getSession();
  const debouncedApiFetch = useDebounce(apiFetch, 1000);
  const { mutate } = useSWRConfig();
  const { data: catalogItem } = useSWR<CatalogItem>(
    workshopProvision.spec.catalogItem
      ? apiPaths.CATALOG_ITEM({
          namespace: workshopProvision.spec.catalogItem.namespace,
          name: workshopProvision.spec.catalogItem.name,
        })
      : null,
    fetcher
  );
  const [salesforceObj, dispatchSalesforceObj] = useReducer(reducer, {
    salesforce_id: workshopProvision.spec.parameters?.salesforce_id || '',
    valid: !!workshopProvision.spec.parameters?.salesforce_id,
    completed: workshopProvision.spec.parameters?.salesforce_id ? false : true,
  });
  const { data: resourceClaims } = useSWR<ResourceClaim[]>(
    workshop
      ? apiPaths.RESOURCE_CLAIMS({
          namespace: serviceNamespaceName,
          labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
          limit: 'ALL',
        })
      : null,
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_CLAIMS({
          namespace: serviceNamespaceName,
          labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        })
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    }
  );

  useEffect(() => {
    if (!salesforceObj.completed) {
      checkSalesforceId(salesforceObj.salesforce_id, debouncedApiFetch).then(
        ({ valid, message }: { valid: boolean; message?: string }) =>
          dispatchSalesforceObj({ type: 'complete', salesforceIdValid: valid })
      );
    } else if (workshopProvision.spec.parameters?.salesforce_id !== salesforceObj.salesforce_id) {
      patchWorkshopProvisionSpec({
        parameters: { ...workshopProvision.spec.parameters, salesforce_id: salesforceObj.salesforce_id },
      });
      for (let resourceClaim of resourceClaims) {
        if (resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/salesforce-id`] !== salesforceObj.salesforce_id) {
          patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
            metadata: { annotations: { [`${DEMO_DOMAIN}/salesforce-id`]: salesforceObj.salesforce_id } },
          });
        }
      }
    }
  }, [dispatchSalesforceObj, salesforceObj, debouncedApiFetch]);

  async function patchWorkshopProvisionSpec(patch: {
    count?: number;
    concurrency?: number;
    startDelay?: number;
    parameters?: any;
  }) {
    await patchWorkshopProvision({
      name: workshopProvision.metadata.name,
      namespace: workshopProvision.metadata.namespace,
      patch: { spec: patch },
    });
    mutate(
      apiPaths.WORKSHOP_PROVISIONS({
        workshopName: workshopProvision.metadata.labels['babylon.gpte.redhat.com/workshop'],
        namespace: workshopProvision.metadata.namespace,
        limit: 'ALL',
      })
    );
  }

  return (
    <>
      <DescriptionList isHorizontal>
        <DescriptionListGroup>
          <DescriptionListTerm>Name</DescriptionListTerm>
          <DescriptionListDescription>
            {workshopProvision.metadata.name}
            {isAdmin ? <OpenshiftConsoleLink resource={workshopProvision} /> : null}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Catalog Item</DescriptionListTerm>
          <DescriptionListDescription>
            {catalogItem ? (
              <>
                <Link to={`/catalog?item=${catalogItem.metadata.namespace}%2F${catalogItem.metadata.name}`}>
                  {displayName(catalogItem)}
                </Link>
                {isAdmin ? <OpenshiftConsoleLink resource={catalogItem} /> : null}
              </>
            ) : (
              <p>
                Missing catalog item {workshopProvision.spec.catalogItem.name} in{' '}
                {workshopProvision.spec.catalogItem.namespace}
              </p>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Parameters</DescriptionListTerm>
          <DescriptionListDescription>
            <CodeBlock>
              <CodeBlockCode>{yaml.dump(workshopProvision.spec.parameters || {})}</CodeBlockCode>
            </CodeBlock>
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Salesforce ID</DescriptionListTerm>

          <div style={{ maxWidth: 300, display: 'flex', alignItems: 'center', gap: 'var(--pf-global--spacer--md)' }}>
            <TextInput
              type="text"
              key="salesforce_id"
              id="salesforce_id"
              onChange={(value) => dispatchSalesforceObj({ type: 'set_salesforceId', salesforceId: value })}
              value={salesforceObj.salesforce_id}
              validated={
                salesforceObj.salesforce_id
                  ? salesforceObj.completed && salesforceObj.valid
                    ? 'success'
                    : salesforceObj.completed
                    ? 'error'
                    : 'default'
                  : 'default'
              }
            />
            <Tooltip
              position="right"
              content={<div>Salesforce Opportunity ID, Campaign ID, CDH Party or Project ID.</div>}
            >
              <OutlinedQuestionCircleIcon
                aria-label="Salesforce Opportunity ID, Campaign ID, CDH Party or Project ID."
                className="tooltip-icon-only"
              />
            </Tooltip>
          </div>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>
            {workshop.spec.multiuserServices ? 'Workshop Instance Count' : 'Workshop User Count'}
          </DescriptionListTerm>
          <DescriptionListDescription>
            <PatientNumberInput
              min={0}
              max={
                isAdmin
                  ? 200
                  : workshopProvision.spec.parameters?.salesforce_id || workshop.spec.multiuserServices
                  ? 200
                  : 1
              }
              onChange={(value: number) => patchWorkshopProvisionSpec({ count: value })}
              value={workshopProvision.spec.count}
              style={{ paddingRight: 'var(--pf-global--spacer--md)' }}
            />
            <Tooltip
              position="right"
              content={
                workshop.spec.multiuserServices ? (
                  <p>Number of shared instances for the workshop, each instance supports multiple users.</p>
                ) : (
                  <p>
                    Number of independent instances for the workshop, each user gets a dedicated instance. <br />
                    Salesforce Id is required to increase it.
                  </p>
                )
              }
            >
              <OutlinedQuestionCircleIcon
                aria-label="Number of independent services for the workshop"
                className="tooltip-icon-only"
              />
            </Tooltip>
          </DescriptionListDescription>
        </DescriptionListGroup>
        {isAdmin ? (
          <>
            <DescriptionListGroup>
              <DescriptionListTerm>Provision Concurrency</DescriptionListTerm>
              <DescriptionListDescription>
                <PatientNumberInput
                  min={1}
                  max={30}
                  onChange={(value: number) => patchWorkshopProvisionSpec({ concurrency: value })}
                  value={workshopProvision.spec.concurrency}
                  style={{ paddingRight: 'var(--pf-global--spacer--md)' }}
                />
                (only visible to admins)
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Provision Start Interval</DescriptionListTerm>
              <DescriptionListDescription>
                <PatientNumberInput
                  min={10}
                  max={999}
                  onChange={(value: number) => patchWorkshopProvisionSpec({ startDelay: value })}
                  value={workshopProvision.spec.startDelay}
                  style={{ paddingRight: 'var(--pf-global--spacer--md)' }}
                />
                (only visible to admins)
              </DescriptionListDescription>
            </DescriptionListGroup>
          </>
        ) : null}
      </DescriptionList>
    </>
  );
};

export default WorkshopsItemProvisioningItem;
