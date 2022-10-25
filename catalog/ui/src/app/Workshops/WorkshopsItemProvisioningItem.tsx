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
import { apiPaths, fetcher, patchWorkshopProvision } from '@app/api';
import { CatalogItem, WorkshopProvision } from '@app/types';
import { displayName } from '@app/util';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import PatientNumberInput from '@app/components/PatientNumberInput';
import useSession from '@app/utils/useSession';
import useSWR, { useSWRConfig } from 'swr';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';

const WorkshopsItemProvisioningItem: React.FC<{
  workshopProvision: WorkshopProvision;
}> = ({ workshopProvision }) => {
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

  async function patchWorkshopProvisionSpec(patch: { count?: number; concurrency?: number; startDelay?: number }) {
    await patchWorkshopProvision({
      name: workshopProvision.metadata.name,
      namespace: workshopProvision.metadata.namespace,
      patch: { spec: patch },
    });
    mutate(
      apiPaths.WORKSHOP_PROVISIONS({
        workshopName: workshopProvision.metadata.labels['babylon.gpte.redhat.com/workshop'],
        namespace: workshopProvision.metadata.namespace,
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
          <DescriptionListTerm>Workshop User Count</DescriptionListTerm>
          <DescriptionListDescription>
            <PatientNumberInput
              min={0}
              max={200}
              onChange={(value: number) => patchWorkshopProvisionSpec({ count: value })}
              value={workshopProvision.spec.count}
              style={{ paddingRight: 'var(--pf-global--spacer--md)' }}
            />
            <Tooltip position="right" content={<p>Number of independent services for the workshop.</p>}>
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
                  max={10}
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
