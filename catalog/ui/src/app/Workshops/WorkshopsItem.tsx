import React from 'react';
import { useEffect, useReducer, useRef } from 'react';
import { useSelector } from 'react-redux';
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
  deleteResourceClaim,
  deleteWorkshop,
  getWorkshop,
  listNamespaces,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';

import { selectServiceNamespaces, selectUserIsAdmin } from '@app/store';

import { Namespace, NamespaceList, ResourceClaim, ServiceNamespace, Workshop } from '@app/types';
import { displayName } from '@app/util';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';

import LoadingIcon from '@app/components/LoadingIcon';
import ResourceClaimDeleteModal from '@app/components/ResourceClaimDeleteModal';
import ResourceClaimStartModal from '@app/components/ResourceClaimStartModal';
import ResourceClaimStopModal from '@app/components/ResourceClaimStopModal';

import WorkshopActions from './WorkshopActions';
import WorkshopDeleteModal from './WorkshopDeleteModal';
import WorkshopsItemDetails from './WorkshopsItemDetails';
import WorkshopsItemProvisioning from './WorkshopsItemProvisioning';
import WorkshopsItemServices from './WorkshopsItemServices';
import WorkshopsItemUserAssignments from './WorkshopsItemUserAssignments';

import ServiceNamespaceSelect from '@app/Services/ServiceNamespaceSelect';

import './workshops.css';

export interface ModalState {
  action?: 'delete' | 'deleteService' | 'startService' | 'stopService';
  modal?: string;
  resourceClaim?: ResourceClaim;
}

const WorkshopsItem: React.FC<{
  activeTab: string;
  serviceNamespaceName: string;
  workshopName: string;
}> = ({ activeTab, serviceNamespaceName, workshopName }) => {
  const history = useHistory();
  const location = useLocation();
  const componentWillUnmount = useRef(false);
  const sessionServiceNamespaces = useSelector(selectServiceNamespaces);
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);

  const [modalState, setModalState] = React.useState<ModalState>({});
  const [resourceClaimsFetchState, reduceResourceClaimsFetchState] = useReducer(k8sFetchStateReducer, null);
  const [selectedResourceClaims, setSelectedResourceClaims] = React.useState<ResourceClaim[]>([]);
  const [userNamespacesFetchState, reduceUserNamespacesFetchState] = useReducer(k8sFetchStateReducer, null);
  const [workshopFetchState, reduceWorkshopFetchState] = useReducer(k8sFetchStateReducer, null);

  const serviceNamespaces: ServiceNamespace[] = userNamespacesFetchState?.items
    ? userNamespacesFetchState.items.map((ns: Namespace): ServiceNamespace => {
        return {
          name: ns.metadata.name,
          displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
        };
      })
    : sessionServiceNamespaces;
  const serviceNamespace: ServiceNamespace = (serviceNamespaces || []).find(
    (ns) => ns.name === serviceNamespaceName
  ) || { name: serviceNamespaceName, displayName: serviceNamespaceName };

  const workshop: Workshop = workshopFetchState?.item as Workshop;

  async function fetchUserNamespaces(): Promise<void> {
    const userNamespaceList: NamespaceList = await listNamespaces({
      labelSelector: 'usernamespace.gpte.redhat.com/user-uid',
    });
    if (!userNamespacesFetchState.activity.canceled) {
      reduceUserNamespacesFetchState({
        type: 'post',
        k8sObjectList: userNamespaceList,
      });
    }
  }

  async function fetchWorkshop(): Promise<void> {
    let workshop: Workshop = null;
    try {
      workshop = await getWorkshop(serviceNamespaceName, workshopName);
    } catch (error) {
      if (!(error instanceof Response && error.status === 404)) {
        throw error;
      }
    }
    if (!workshopFetchState.activity.canceled) {
      reduceWorkshopFetchState({
        type: 'post',
        item: workshop,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceWorkshopFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function onServiceDeleteConfirm(): Promise<void> {
    const deleteResourceClaims: ResourceClaim[] = modalState.resourceClaim
      ? [modalState.resourceClaim]
      : selectedResourceClaims;
    for (const resourceClaim of deleteResourceClaims) {
      await deleteResourceClaim(resourceClaim);
    }
    if (resourceClaimsFetchState) {
      reduceResourceClaimsFetchState({
        type: 'removeItems',
        items: deleteResourceClaims,
      });
    }
    setModalState({});
  }

  async function onServiceStartConfirm(): Promise<void> {
    const updatedResourceClaims: ResourceClaim[] = [];
    const startResourceClaims: ResourceClaim[] = modalState.resourceClaim
      ? [modalState.resourceClaim]
      : selectedResourceClaims;
    for (const resourceClaim of startResourceClaims) {
      updatedResourceClaims.push(await startAllResourcesInResourceClaim(resourceClaim));
    }
    if (resourceClaimsFetchState) {
      reduceResourceClaimsFetchState({
        type: 'updateItems',
        items: updatedResourceClaims,
      });
    }
    setModalState({});
  }

  async function onServiceStopConfirm(): Promise<void> {
    const updatedResourceClaims: ResourceClaim[] = [];
    const stopResourceClaims: ResourceClaim[] = modalState.resourceClaim
      ? [modalState.resourceClaim]
      : selectedResourceClaims;
    for (const resourceClaim of stopResourceClaims) {
      updatedResourceClaims.push(await stopAllResourcesInResourceClaim(resourceClaim));
    }
    if (resourceClaimsFetchState) {
      reduceResourceClaimsFetchState({
        type: 'updateItems',
        items: updatedResourceClaims,
      });
    }
    setModalState({});
  }

  async function onWorkshopDeleteConfirm(): Promise<void> {
    await deleteWorkshop(workshop);
    history.push(`/workshops/${serviceNamespaceName}`);
  }

  // Track unmount for other effect cleanups
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Start fetch of user namespaces for admin users
  useEffect(() => {
    if (userIsAdmin) {
      reduceUserNamespacesFetchState({ type: 'startFetch' });
    }
  }, [userIsAdmin]);

  // Start fetching workshop
  useEffect(() => {
    reduceWorkshopFetchState({ type: 'startFetch' });
  }, [workshopName]);

  // Fetch user namespaces
  useEffect(() => {
    if (userNamespacesFetchState?.canContinue) {
      fetchUserNamespaces();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(userNamespacesFetchState);
      }
    };
  }, [userNamespacesFetchState]);

  // Fetch Workshop
  useEffect(() => {
    if (workshopFetchState?.canContinue) {
      fetchWorkshop();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(workshopFetchState);
      }
    };
  }, [workshopFetchState]);

  // Show loading until whether the user is admin is determined.
  if (userIsAdmin === null) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }

  // Show loading or not found
  if (!workshop) {
    if (workshopFetchState?.finished) {
      return (
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
    } else {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        </PageSection>
      );
    }
  }

  return (
    <>
      {modalState?.action === 'delete' ? (
        <WorkshopDeleteModal
          key="deleteModal"
          isOpen={true}
          onClose={() => setModalState({})}
          onConfirm={onWorkshopDeleteConfirm}
          workshop={workshop}
        />
      ) : modalState?.action === 'deleteService' ? (
        <ResourceClaimDeleteModal
          key="deleteServiceModal"
          isOpen={true}
          onClose={() => setModalState({})}
          onConfirm={onServiceDeleteConfirm}
          resourceClaims={modalState.resourceClaim ? [modalState.resourceClaim] : selectedResourceClaims}
        />
      ) : modalState?.action === 'startService' ? (
        <ResourceClaimStartModal
          key="startServiceModal"
          isOpen={true}
          onClose={() => setModalState({})}
          onConfirm={onServiceStartConfirm}
          resourceClaims={modalState.resourceClaim ? [modalState.resourceClaim] : selectedResourceClaims}
        />
      ) : modalState?.action === 'stopService' ? (
        <ResourceClaimStopModal
          key="stopServiceModal"
          isOpen={true}
          onClose={() => setModalState({})}
          onConfirm={onServiceStopConfirm}
          resourceClaims={modalState.resourceClaim ? [modalState.resourceClaim] : selectedResourceClaims}
        />
      ) : null}
      {userIsAdmin || serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="workshops-topbar" variant={PageSectionVariants.light}>
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
      <PageSection key="head" className="workshops-item-head" variant={PageSectionVariants.light}>
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
                workshop={workshop}
                actionHandlers={{
                  delete: () => setModalState({ modal: 'action', action: 'delete' }),
                  deleteService:
                    selectedResourceClaims.length === 0
                      ? null
                      : () => setModalState({ modal: 'action', action: 'deleteService' }),
                  startService:
                    selectedResourceClaims.length === 0
                      ? null
                      : () => setModalState({ modal: 'action', action: 'startService' }),
                  stopService:
                    selectedResourceClaims.length === 0
                      ? null
                      : () => setModalState({ modal: 'action', action: 'stopService' }),
                }}
              />
            </Bullseye>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light} className="workshops-item-body">
        <Tabs
          activeKey={activeTab || 'details'}
          onSelect={(e, tabIndex) => history.push(`/workshops/${serviceNamespaceName}/${workshopName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <WorkshopsItemDetails
              onWorkshopUpdate={(workshop: Workshop) =>
                reduceWorkshopFetchState({ type: 'updateItem', item: workshop })
              }
              workshop={workshop}
            />
          </Tab>
          <Tab eventKey="provision" title={<TabTitleText>Provisioning</TabTitleText>}>
            <WorkshopsItemProvisioning workshop={workshop} />
          </Tab>
          <Tab eventKey="services" title={<TabTitleText>Services</TabTitleText>}>
            <WorkshopsItemServices
              modalState={modalState}
              setModalState={setModalState}
              setSelectedResourceClaims={setSelectedResourceClaims}
              resourceClaimsFetchState={resourceClaimsFetchState}
              reduceResourceClaimsFetchState={reduceResourceClaimsFetchState}
              workshop={workshop}
            />
          </Tab>
          <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            <WorkshopsItemUserAssignments
              onWorkshopUpdate={(workshop: Workshop) =>
                reduceWorkshopFetchState({ type: 'updateItem', item: workshop })
              }
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

export default WorkshopsItem;
