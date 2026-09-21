import React from 'react';
import { Link } from 'react-router-dom';
import * as yaml from 'js-yaml';
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
import type { CatalogItem, Workshop, WorkshopProvision } from '@app/types';
import { displayName } from '@app/util';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import PatientNumberInput from '@app/components/PatientNumberInput';
import useSession from '@app/utils/useSession';
import useSWR, { useSWRConfig } from 'swr';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import { workshopInstanceLimit } from './workshop-instance-limits';
import { isWorkshopLocked } from './workshops-utils';

const WorkshopsItemProvisioningItem: React.FC<{
  workshop: Workshop;
  workshopProvision: WorkshopProvision;
}> = ({ workshop, workshopProvision }) => {
  const { isAdmin } = useSession().getSession();
  const { sfdc_enabled } = useInterfaceConfig();
  const { mutate } = useSWRConfig();
  const { data: catalogItem } = useSWR<CatalogItem>(
    workshopProvision.spec.catalogItem
      ? apiPaths.CATALOG_ITEM({
          namespace: workshopProvision.spec.catalogItem.namespace,
          name: workshopProvision.spec.catalogItem.name,
        })
      : null,
    fetcher,
  );
  const isCountLocked = isWorkshopLocked(workshop) && !isAdmin;
  const instanceLimit = workshop.spec.multiuserServices
    ? sfdc_enabled && JSON.parse(workshopProvision.spec.parameters?.salesforce_items || '[]').length > 0
      ? 5
      : 1
    : workshopInstanceLimit(catalogItem);
  // Ops can approve counts above the self-service limit. Do not clamp those
  // counts when the owner reduces them or edits an unrelated field.
  const maxCount = Math.max(instanceLimit, workshopProvision.spec.count);

  async function patchWorkshopProvisionSpec(patch: {
    count?: number;
    concurrency?: number;
    startDelay?: number;
    parameters?: unknown;
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
      }),
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
                <Link to={`/catalog/${catalogItem.metadata.namespace}?item=${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`}>
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
            Workshop Instance Count
          </DescriptionListTerm>
          <DescriptionListDescription>
            <PatientNumberInput
              min={0}
              max={maxCount}
              adminModifier={true}
              rejectOutOfRange
              isDisabled={isCountLocked || !catalogItem}
              inputAriaLabel="Workshop Instance Count"
              onChange={(value: number) => patchWorkshopProvisionSpec({ count: value })}
              value={workshopProvision.spec.count}
              style={{ paddingRight: "var(--pf-t--global--spacer--md)" }}
            />
            {isCountLocked ? <p>Instance count is locked by operations. Contact operations to change it.</p> : null}
            <Tooltip
              position="right"
              content={
                workshop.spec.multiuserServices ? (
                  <p>This item does not support multiple instances by default. If you increase the number of instances, you may need to manage user assignments manually. <br />
                     {sfdc_enabled ? 'A Salesforce ID is required to increase the limit from 1 to 5. ' : ''}
                     For additional instances, please submit a White Glove request.
                  </p>
                ) : (
                  <p>
                    Number of independent instances for the workshop, each user gets a dedicated instance. <br />
                    The self-service limit is {instanceLimit}. Existing counts approved by operations are preserved.
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
                  style={{ paddingRight: "var(--pf-t--global--spacer--md)" }}
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
                  style={{ paddingRight: "var(--pf-t--global--spacer--md)" }}
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
