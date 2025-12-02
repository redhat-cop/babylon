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
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

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
            Workshop Instance Count
          </DescriptionListTerm>
          <DescriptionListDescription>
            <PatientNumberInput
              min={0}
              max={sfdc_enabled && workshopProvision.spec.parameters?.salesforce_id ? workshop.spec.multiuserServices ? 5 : 30 : 1}
              adminModifier={true}
              onChange={(value: number) => patchWorkshopProvisionSpec({ count: value })}
              value={workshopProvision.spec.count}
              style={{ paddingRight: "var(--pf-t--global--spacer--md)" }}
            />
            <Tooltip
              position="right"
              content={
                workshop.spec.multiuserServices ? (
                  <p>This item does not support multiple instances by default. If you increase the number of instances, you may need to manage user assignments manually. <br />
                     A Salesforce ID is required to increase the limit from 1 to 5. For more than 5 instances, please submit a White Glove request.
                  </p>
                ) : (
                  <p>
                    Number of independent instances for the workshop, each user gets a dedicated instance. <br />
                    {sfdc_enabled ? 'Salesforce Id is required to increase it.' : ''}
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
