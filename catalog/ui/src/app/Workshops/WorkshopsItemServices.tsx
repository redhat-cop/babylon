import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, EmptyStateBody, EmptyStateIcon, Title } from '@patternfly/react-core';
import DollarSignIcon from '@patternfly/react-icons/dist/js/icons/dollar-sign-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { K8sObjectReference, ResourceClaim } from '@app/types';
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

import './workshops-item-services.css';

const WorkshopsItemServices: React.FC<{
  modalState: ModalState;
  resourceClaims: ResourceClaim[];
  showModal: (modalState: ModalState) => void;
  setSelectedResourceClaims: (resourceClaims: ResourceClaim[]) => void;
}> = ({ showModal, resourceClaims, setSelectedResourceClaims }) => {
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const { isAdmin } = useSession().getSession();

  useEffect(() => {
    const selectedResourceClaims: ResourceClaim[] = resourceClaims.filter((resourceClaim) =>
      selectedUids.includes(resourceClaim.metadata.uid),
    );
    setSelectedResourceClaims(selectedResourceClaims);
  }, [resourceClaims, selectedUids, setSelectedResourceClaims]);

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
        columns={['Name', 'GUID', 'Status', 'Created', 'Actions']}
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
                  : r?.data?.labUserInterfaceData,
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
                  : r?.data?.labUserInterfaceMethod,
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
            onSelect: (isSelected) =>
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
    </>
  );
};

export default WorkshopsItemServices;
