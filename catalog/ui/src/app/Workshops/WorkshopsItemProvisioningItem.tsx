import React from 'react';
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
} from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import { apiPaths, fetcher, patchWorkshopProvision } from '@app/api';
import { CatalogItem, Workshop, WorkshopProvision } from '@app/types';
import { displayName } from '@app/util';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import PatientNumberInput from '@app/components/PatientNumberInput';
import useSession from '@app/utils/useSession';
import useSWR, { useSWRConfig } from 'swr';

const WorkshopsItemProvisioningItem: React.FC<{
  workshop: Workshop;
  workshopProvision: WorkshopProvision;
}> = ({ workshop, workshopProvision }) => {
  const { isAdmin } = useSession().getSession();
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
              style={{ paddingRight: 'var(--pf-v5-global--spacer--md)' }}
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
                  style={{ paddingRight: 'var(--pf-v5-global--spacer--md)' }}
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
                  style={{ paddingRight: 'var(--pf-v5-global--spacer--md)' }}
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
