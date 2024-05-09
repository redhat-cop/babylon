import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionGroup,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  Modal,
  ModalVariant,
  Spinner,
  Title,
} from '@patternfly/react-core';
import DollarSignIcon from '@patternfly/react-icons/dist/js/icons/dollar-sign-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { K8sObjectReference, ResourceClaim, WorkshopProvision, WorkshopUserAssignment } from '@app/types';
import { displayName, BABYLON_DOMAIN, getCostTracker } from '@app/util';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ServiceStatus from '@app/Services/ServiceStatus';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import LabInterfaceLink from '@app/components/LabInterfaceLink';
import { getMostRelevantResourceAndTemplate } from '@app/Services/service-utils';
import useSession from '@app/utils/useSession';
import { ModalState } from './WorkshopsItem';
import { apiPaths, deleteResourceClaim, patchWorkshopProvision } from '@app/api';
import { useSWRConfig } from 'swr';

import './workshops-item-services.css';

const WorkshopsItemServices: React.FC<{
  modalState: ModalState;
  workshopProvisions: WorkshopProvision[];
  resourceClaims: ResourceClaim[];
  showModal: (modalState: ModalState) => void;
  setSelectedResourceClaims: (resourceClaims: ResourceClaim[]) => void;
  userAssignments: WorkshopUserAssignment[];
}> = ({ showModal, workshopProvisions, resourceClaims, setSelectedResourceClaims, userAssignments }) => {
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const { isAdmin } = useSession().getSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { mutate } = useSWRConfig();

  const unusedResourceClaims = resourceClaims.filter(
    (r) => !userAssignments.some((uA) => uA.spec.resourceClaimName === r.metadata.name && uA.spec.assignment?.email)
  );

  useEffect(() => {
    const selectedResourceClaims: ResourceClaim[] = resourceClaims.filter((resourceClaim) =>
      selectedUids.includes(resourceClaim.metadata.uid)
    );
    setSelectedResourceClaims(selectedResourceClaims);
  }, [resourceClaims, selectedUids, setSelectedResourceClaims]);

  const deleteUnusedInstances = useCallback(
    async ({ count }: { count: number }) => {
      setIsLoading(true);
      for (let workshopProvision of workshopProvisions) {
        await patchWorkshopProvision({
          name: workshopProvision.metadata.name,
          namespace: workshopProvision.metadata.namespace,
          patch: { spec: { count } },
        });
        mutate(
          apiPaths.WORKSHOP_PROVISIONS({
            workshopName: workshopProvision.metadata.labels[`${BABYLON_DOMAIN}/workshop`],
            namespace: workshopProvision.metadata.namespace,
            limit: 'ALL',
          })
        );
      }
      for (let resourceClaim of unusedResourceClaims) {
        await deleteResourceClaim(resourceClaim);
      }
      for (let workshopProvision of workshopProvisions) {
        mutate(
          apiPaths.RESOURCE_CLAIMS({
            namespace: workshopProvision.metadata.namespace,
            labelSelector: `${BABYLON_DOMAIN}/workshop=${
              workshopProvision.metadata.labels[`${BABYLON_DOMAIN}/workshop`]
            }`,
            limit: 'ALL',
          })
        );
      }
      setIsLoading(false);
      setIsOpen(false);
    },
    [workshopProvisions, unusedResourceClaims]
  );

  if (resourceClaims.length == 0) {
    return (
      <EmptyState variant="full">
        <EmptyStateIcon icon={ExclamationTriangleIcon} />
        <Title headingLevel="h1" size="lg">
          No Services Found
        </Title>
        <EmptyStateBody>No services have been provisioned for this workshop.</EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <>
      <SelectableTable
        key="table"
        columns={['Name', 'GUID', 'Status', 'Assigned User', 'Created', 'Actions']}
        onSelectAll={(isSelected: boolean) => {
          if (isSelected) {
            setSelectedUids(resourceClaims.map((resourceClaim) => resourceClaim.metadata.uid));
          } else {
            setSelectedUids([]);
          }
        }}
        rows={resourceClaims.map((resourceClaim: ResourceClaim) => {
          const resourceHandle: K8sObjectReference = resourceClaim.status?.resourceHandle;
          const guid = resourceHandle?.name ? resourceHandle.name.replace(/^guid-/, '') : null;
          const specResources = resourceClaim.spec.resources || [];
          const resources = (resourceClaim.status?.resources || []).map((r) => r.state);
          const costTracker = getCostTracker(resourceClaim);
          const actionHandlers = {
            delete: () => showModal({ action: 'deleteService', resourceClaims: [resourceClaim] }),
            getCost: () => showModal({ action: 'getCost', resourceClaims: [resourceClaim] }),
          };
          // Find lab user interface information either in the resource claim or inside resources
          // associated with the provisioned service.
          const labUserInterfaceData =
            resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceData`] ||
            resourceClaim?.status?.summary?.provision_data?.lab_ui_data ||
            resourceClaim?.status?.summary?.provision_data?.labUserInterfaceData ||
            resources
              .map((r) =>
                r?.kind === 'AnarchySubject'
                  ? r?.spec?.vars?.provision_data?.lab_ui_data
                  : r?.data?.labUserInterfaceData
              )
              .map((j) => (typeof j === 'string' ? JSON.parse(j) : j))
              .find((u) => u != null);
          const labUserInterfaceMethod =
            resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceMethod`] ||
            resourceClaim?.status?.summary?.provision_data?.lab_ui_method ||
            resourceClaim?.status?.summary?.provision_data?.labUserInterfaceMethod ||
            resources
              .map((r) =>
                r?.kind === 'AnarchySubject'
                  ? r?.spec?.vars?.provision_data?.lab_ui_method
                  : r?.data?.labUserInterfaceMethod
              )
              .find((u) => u != null);
          const labUserInterfaceUrl =
            resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceUrl`] ||
            resourceClaim?.status?.summary?.provision_data?.labUserInterfaceUrl ||
            resourceClaim?.status?.summary?.provision_data?.lab_ui_url ||
            resourceClaim?.status?.summary?.provision_data?.bookbag_url ||
            resources
              .map((r) => {
                const data = r?.kind === 'AnarchySubject' ? r.spec?.vars?.provision_data : r?.data;
                return data?.labUserInterfaceUrl || data?.lab_ui_url || data?.bookbag_url;
              })
              .find((u) => u != null);
          const cells: any[] = [
            // Name
            <>
              <Link key="services" to={`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`}>
                {displayName(resourceClaim)}
              </Link>
              {isAdmin ? <OpenshiftConsoleLink key="console" resource={resourceClaim} /> : null}
            </>,
            // GUID
            <>
              {guid ? (
                isAdmin && resourceHandle ? (
                  [
                    <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.name}`}>
                      {guid}
                    </Link>,
                    <OpenshiftConsoleLink key="console" reference={resourceHandle} />,
                  ]
                ) : (
                  guid
                )
              ) : (
                <p>-</p>
              )}
            </>,

            // Status
            <>
              {specResources.length >= 1 || resourceClaim.status?.summary ? (
                <ServiceStatus
                  creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                  resource={getMostRelevantResourceAndTemplate(resourceClaim).resource}
                  resourceTemplate={getMostRelevantResourceAndTemplate(resourceClaim).template}
                  resourceClaim={resourceClaim}
                  summary={resourceClaim.status?.summary}
                />
              ) : (
                <p>...</p>
              )}
            </>,

            // User
            <>
              {userAssignments.some((uA) => uA.spec.resourceClaimName === resourceClaim.metadata.name)
                ? userAssignments
                    .filter((uA) => uA.spec.resourceClaimName === resourceClaim.metadata.name)
                    .map((uA) => <p>{uA.spec.assignment?.email}</p>)
                : '-'}
            </>,

            // Created
            <>
              <LocalTimestamp key="timestamp" timestamp={resourceClaim.metadata.creationTimestamp} />
              <br key="break" />
              (<TimeInterval key="interval" toTimestamp={resourceClaim.metadata.creationTimestamp} />)
            </>,
            // Actions
            <React.Fragment key="actions">
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 'var(--pf-global--spacer--sm)',
                }}
                className="workshops-item-services__actions"
              >
                <ButtonCircleIcon
                  key="actions__delete"
                  onClick={actionHandlers.delete}
                  description="Delete (will start a new service)"
                  icon={TrashIcon}
                />
                {costTracker ? (
                  <ButtonCircleIcon
                    key="actions__cost"
                    onClick={actionHandlers.getCost}
                    description="Get amount spent"
                    icon={DollarSignIcon}
                  />
                ) : null}
                {
                  // Lab Interface
                  labUserInterfaceUrl ? (
                    <LabInterfaceLink
                      key="actions__lab-interface"
                      url={labUserInterfaceUrl}
                      data={labUserInterfaceData}
                      method={labUserInterfaceMethod}
                      variant="circle"
                    />
                  ) : null
                }
              </div>
            </React.Fragment>,
          ];

          return {
            cells: cells,
            onSelect: (isSelected: boolean) =>
              setSelectedUids((uids) => {
                if (isSelected) {
                  if (uids.includes(resourceClaim.metadata.uid)) {
                    return uids;
                  } else {
                    return [...uids, resourceClaim.metadata.uid];
                  }
                } else {
                  return uids.filter((uid) => uid !== resourceClaim.metadata.uid);
                }
              }),
            selected: selectedUids.includes(resourceClaim.metadata.uid),
          };
        })}
      />
      <Modal
        className="delete-unused-modal"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Delete unused instances"
        variant={ModalVariant.medium}
        actions={[
          <Button
            key="confirm"
            variant="primary"
            isDisabled={isLoading}
            onClick={() => deleteUnusedInstances({ count: resourceClaims.length - unusedResourceClaims.length })}
          >
            {isLoading ? <Spinner size="sm" /> : null} Confirm
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>,
        ]}
      >
        <p>Unused instances: {unusedResourceClaims.length}</p>
        <p>
          This action will size down the workshop to {resourceClaims.length - unusedResourceClaims.length} instances
        </p>
      </Modal>
      {unusedResourceClaims.length > 0 ? (
        <ActionGroup key="users-actions" style={{ marginTop: 'var(--pf-global--spacer--md)' }}>
          <Button onClick={() => setIsOpen(true)}>Delete unused instances</Button>
        </ActionGroup>
      ) : null}
    </>
  );
};

export default WorkshopsItemServices;
