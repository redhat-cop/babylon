import React, { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { ErrorBoundary, useErrorHandler } from 'react-error-boundary';
import { useHistory, useLocation, Link } from 'react-router-dom';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import {
  apiPaths,
  deleteResourceClaim,
  deleteWorkshop,
  fetcher,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';
import { selectServiceNamespaces, selectUserIsAdmin } from '@app/store';
import { NamespaceList, ResourceClaim, ResourceClaimList, ServiceNamespace, Workshop } from '@app/types';
import { BABYLON_DOMAIN, compareK8sObjects, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import WorkshopActions from './WorkshopActions';
import WorkshopsItemDetails from './WorkshopsItemDetails';
import WorkshopsItemProvisioning from './WorkshopsItemProvisioning';
import WorkshopsItemServices from './WorkshopsItemServices';
import WorkshopsItemUserAssignments from './WorkshopsItemUserAssignments';
import ServiceNamespaceSelect from '@app/Services/ServiceNamespaceSelect';
import Modal, { useModal } from '@app/Modal/Modal';
import ResourceClaimDeleteModal from '@app/components/ResourceClaimDeleteModal';
import ResourceClaimStartModal from '@app/components/ResourceClaimStartModal';
import ResourceClaimStopModal from '@app/components/ResourceClaimStopModal';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

import './workshops-item.css';
export interface ModalState {
  action?: 'delete' | 'deleteService' | 'startService' | 'stopService';
  resourceClaim?: ResourceClaim;
}

const WorkshopsItemComponent: React.FC<{
  activeTab: string;
  serviceNamespaceName: string;
  workshopName: string;
}> = ({ activeTab, serviceNamespaceName, workshopName }) => {
  const history = useHistory();
  const location = useLocation();
  const sessionServiceNamespaces = useSelector(selectServiceNamespaces);
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  const [modalState, setModalState] = useState<ModalState>({});
  const [modalAction, openModalAction] = useModal();
  const [modalDelete, openModalDelete] = useModal();
  const [selectedResourceClaims, setSelectedResourceClaims] = useState<ResourceClaim[]>([]);
  const showModal = useCallback(
    ({ action, resourceClaim }: ModalState) => {
      setModalState({ action, resourceClaim });
      if (action === 'delete') {
        openModalDelete();
      } else if (action === 'deleteService' || action === 'startService' || action === 'stopService') {
        openModalAction();
      }
    },
    [openModalAction, openModalDelete]
  );
  const enableFetchUserNamespaces: boolean = userIsAdmin;
  const { data: userNamespaceList } = useSWR<NamespaceList>(
    enableFetchUserNamespaces ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : '',
    fetcher
  );
  const serviceNamespaces: ServiceNamespace[] = useMemo(() => {
    return enableFetchUserNamespaces
      ? userNamespaceList.items.map((ns): ServiceNamespace => {
          return {
            name: ns.metadata.name,
            displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
          };
        })
      : sessionServiceNamespaces;
  }, [enableFetchUserNamespaces, sessionServiceNamespaces, userNamespaceList]);
  const serviceNamespace: ServiceNamespace = serviceNamespaces.find((ns) => ns.name === serviceNamespaceName) || {
    name: serviceNamespaceName,
    displayName: serviceNamespaceName,
  };

  const { data: workshop, mutate: mutateWorkshop } = useSWR<Workshop>(
    workshopName ? apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }) : null,
    fetcher,
    { refreshInterval: 8000 }
  );
  const {
    data: resourceClaimsPages,
    mutate,
    size,
    setSize,
    error,
  } = useSWRInfinite<ResourceClaimList>(
    (index, previousPageData: ResourceClaimList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.RESOURCE_CLAIMS({
        namespace: serviceNamespaceName,
        labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
        limit: FETCH_BATCH_LIMIT,
        continueId,
      });
    },
    fetcher,
    {
      refreshInterval: 8000,
      revalidateFirstPage: true,
      revalidateAll: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      compare: (currentData: any, newData: any) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.length === 0) return false;
        if (!newData || newData.length === 0) return false;
        if (currentData.length !== newData.length) return false;
        for (let i = 0; i < currentData.length; i++) {
          if (!compareK8sObjects(currentData[i].items, newData[i].items)) return false;
        }
        return true;
      },
    }
  );
  useErrorHandler(error?.status === 404 ? error : null);

  const resourceClaims: ResourceClaim[] = useMemo(
    () => [].concat(...resourceClaimsPages.map((page) => page.items)) || [],
    [resourceClaimsPages]
  );

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: ResourceClaim[]; action: 'update' | 'delete' }) => {
      const resourceClaimsPagesCpy = JSON.parse(JSON.stringify(resourceClaimsPages));
      let p: ResourceClaimList;
      let i: number;
      for ([i, p] of resourceClaimsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              resourceClaimsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              resourceClaimsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(resourceClaimsPagesCpy);
          }
        }
      }
    },
    [mutate, resourceClaimsPages]
  );

  // Fetch all pages
  if (resourceClaimsPages.length > 0 && resourceClaimsPages[resourceClaimsPages.length - 1].metadata.continue) {
    setSize(size + 1);
  }

  async function onServiceDeleteConfirm(): Promise<void> {
    const deleteResourceClaims: ResourceClaim[] = modalState.resourceClaim
      ? [modalState.resourceClaim]
      : selectedResourceClaims;
    for (const resourceClaim of deleteResourceClaims) {
      await deleteResourceClaim(resourceClaim);
    }
    revalidate({ updatedItems: deleteResourceClaims, action: 'delete' });
  }

  async function onServiceStartConfirm(): Promise<void> {
    const updatedResourceClaims: ResourceClaim[] = [];
    const startResourceClaims: ResourceClaim[] = modalState.resourceClaim
      ? [modalState.resourceClaim]
      : selectedResourceClaims;
    for (const resourceClaim of startResourceClaims) {
      updatedResourceClaims.push(await startAllResourcesInResourceClaim(resourceClaim));
    }
    revalidate({ updatedItems: updatedResourceClaims, action: 'update' });
  }

  async function onServiceStopConfirm(): Promise<void> {
    const updatedResourceClaims: ResourceClaim[] = [];
    const stopResourceClaims: ResourceClaim[] = modalState.resourceClaim
      ? [modalState.resourceClaim]
      : selectedResourceClaims;
    for (const resourceClaim of stopResourceClaims) {
      updatedResourceClaims.push(await stopAllResourcesInResourceClaim(resourceClaim));
    }
    revalidate({ updatedItems: updatedResourceClaims, action: 'update' });
  }

  async function onWorkshopDeleteConfirm(): Promise<void> {
    await deleteWorkshop(workshop);
    mutateWorkshop(null);
    history.push(`/workshops/${serviceNamespaceName}`);
  }

  return (
    <>
      <Modal
        ref={modalDelete}
        onConfirm={onWorkshopDeleteConfirm}
        title={workshop ? `Delete workshop ${displayName(workshop)}?` : 'Delete selected workshops?'}
      >
        <p>Provisioned services will be deleted.</p>
      </Modal>

      <Modal ref={modalAction} passModifiers={true} onConfirm={() => null}>
        {modalState?.action === 'deleteService' ? (
          <ResourceClaimDeleteModal
            onConfirm={onServiceDeleteConfirm}
            resourceClaims={modalState.resourceClaim ? [modalState.resourceClaim] : selectedResourceClaims}
          />
        ) : modalState?.action === 'startService' ? (
          <ResourceClaimStartModal
            onConfirm={onServiceStartConfirm}
            resourceClaims={modalState.resourceClaim ? [modalState.resourceClaim] : selectedResourceClaims}
          />
        ) : modalState?.action === 'stopService' ? (
          <ResourceClaimStopModal
            onConfirm={onServiceStopConfirm}
            resourceClaims={modalState.resourceClaim ? [modalState.resourceClaim] : selectedResourceClaims}
          />
        ) : null}
      </Modal>

      {userIsAdmin || serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="workshops-item__topbar" variant={PageSectionVariants.light}>
          <ServiceNamespaceSelect
            currentNamespaceName={serviceNamespaceName}
            serviceNamespaces={serviceNamespaces}
            onSelect={(namespaceName) => {
              if (namespaceName) {
                history.push(`/workshops/${namespaceName}${location.search}`);
              } else {
                history.push(`/workshops${location.search}`);
              }
            }}
          />
        </PageSection>
      ) : null}
      <PageSection key="head" className="workshops-item__head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            {userIsAdmin || serviceNamespaces.length > 1 ? (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/workshops" className={className}>
                      Workshops
                    </Link>
                  )}
                />
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to={`/workshops/${serviceNamespaceName}`} className={className}>
                      {displayName(serviceNamespace)}
                    </Link>
                  )}
                />
                <BreadcrumbItem>{workshopName}</BreadcrumbItem>
              </Breadcrumb>
            ) : (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to={`/workshops/${serviceNamespaceName}`} className={className}>
                      Workshops
                    </Link>
                  )}
                />
                <BreadcrumbItem>{workshopName}</BreadcrumbItem>
              </Breadcrumb>
            )}
            <Title headingLevel="h4" size="xl">
              {displayName(workshop)}
            </Title>
          </SplitItem>
          <SplitItem>
            <Bullseye>
              <WorkshopActions
                position="right"
                workshopName={workshop.spec.displayName}
                actionHandlers={{
                  delete: () => showModal({ action: 'delete' }),
                  deleteService:
                    selectedResourceClaims.length === 0 ? null : () => showModal({ action: 'deleteService' }),
                  startService:
                    selectedResourceClaims.length === 0 ? null : () => showModal({ action: 'startService' }),
                  stopService: selectedResourceClaims.length === 0 ? null : () => showModal({ action: 'stopService' }),
                }}
              />
            </Bullseye>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light} className="workshops-item__body">
        <Tabs
          activeKey={activeTab || 'details'}
          onSelect={(e, tabIndex) => history.push(`/workshops/${serviceNamespaceName}/${workshopName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <WorkshopsItemDetails
              onWorkshopUpdate={(workshop: Workshop) => mutateWorkshop(workshop)}
              workshop={workshop}
            />
          </Tab>
          <Tab eventKey="provision" title={<TabTitleText>Provisioning</TabTitleText>}>
            <WorkshopsItemProvisioning workshop={workshop} />
          </Tab>
          <Tab eventKey="services" title={<TabTitleText>Services</TabTitleText>}>
            <WorkshopsItemServices
              modalState={modalState}
              showModal={showModal}
              setSelectedResourceClaims={setSelectedResourceClaims}
              resourceClaims={resourceClaims}
            />
          </Tab>
          <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            <WorkshopsItemUserAssignments
              onWorkshopUpdate={(workshop: Workshop) => mutateWorkshop(workshop)}
              workshop={workshop}
            />
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(workshop)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const NotFoundComponent: React.FC<{
  workshopName: string;
  serviceNamespaceName: string;
}> = ({ workshopName, serviceNamespaceName }) => (
  <EmptyState variant="full">
    <EmptyStateIcon icon={ExclamationTriangleIcon} />
    <Title headingLevel="h1" size="lg">
      Workshop not found
    </Title>
    <EmptyStateBody>
      Workshop {workshopName} was not found in {serviceNamespaceName}.
    </EmptyStateBody>
  </EmptyState>
);

const WorkshopsItem: React.FC<{
  activeTab: string;
  serviceNamespaceName: string;
  workshopName: string;
}> = ({ activeTab, serviceNamespaceName, workshopName }) => (
  <ErrorBoundary
    fallbackRender={() => <NotFoundComponent workshopName={workshopName} serviceNamespaceName={serviceNamespaceName} />}
  >
    <WorkshopsItemComponent
      activeTab={activeTab}
      workshopName={workshopName}
      serviceNamespaceName={serviceNamespaceName}
    />
  </ErrorBoundary>
);

export default WorkshopsItem;
