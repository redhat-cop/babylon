import React, { useEffect, useReducer, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Link, Redirect, useHistory, useLocation } from 'react-router-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';

import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import { deleteWorkshop, listNamespaces, listWorkshops } from '@app/api';
import { Namespace, NamespaceList, Workshop, WorkshopList, ServiceNamespace } from '@app/types';
import { displayName } from '@app/util';

import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';

import { selectServiceNamespaces, selectUserIsAdmin, selectWorkshopNamespaces } from '@app/store';

import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

import ServiceNamespaceSelect from '@app/Services/ServiceNamespaceSelect';

import WorkshopActions from './WorkshopActions';
import WorkshopDeleteModal from './WorkshopDeleteModal';

import './workshops.css';

const FETCH_BATCH_LIMIT = 30;

function keywordMatch(workshop: Workshop, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  if (
    workshop.metadata.name.includes(keywordLowerCased) ||
    (workshop.spec.description && workshop.spec.description.toLowerCase().includes(keywordLowerCased)) ||
    displayName(workshop).toLowerCase().includes(keywordLowerCased)
  ) {
    return true;
  }
  return false;
}

interface ModalState {
  action?: string;
  modal?: string;
  workshop?: Workshop;
}

const WorkshopsList: React.FC<{
  serviceNamespaceName: string;
}> = ({ serviceNamespaceName }) => {
  const history = useHistory();
  const location = useLocation();
  const componentWillUnmount = useRef(false);
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;

  const sessionServiceNamespaces = useSelector(selectServiceNamespaces);
  const sessionWorkshopNamespaces = useSelector(selectWorkshopNamespaces);
  const userIsAdmin = useSelector(selectUserIsAdmin);

  const [modalState, setModalState] = React.useState<ModalState>({});
  const [selectedUids, setSelectedUids] = React.useState([]);
  const [userNamespacesFetchState, reduceUserNamespacesFetchState] = useReducer(k8sFetchStateReducer, null);
  const [workshopsFetchState, reduceWorkshopsFetchState] = useReducer(k8sFetchStateReducer, null);

  const serviceNamespaces: ServiceNamespace[] = userIsAdmin
    ? userNamespacesFetchState?.items
      ? userNamespacesFetchState.items.map((ns: Namespace): ServiceNamespace => {
          return {
            name: ns.metadata.name,
            displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
          };
        })
      : []
    : sessionWorkshopNamespaces;

  const serviceNamespace: ServiceNamespace = serviceNamespaces.find((ns) => ns.name === serviceNamespaceName) || {
    name: serviceNamespaceName,
    displayName: serviceNamespaceName,
  };

  const fetchNamespaces: string[] = serviceNamespaceName
    ? [serviceNamespaceName]
    : userIsAdmin
    ? null
    : serviceNamespaces.map((ns) => ns.name);

  const workshops: Workshop[] = (workshopsFetchState?.filteredItems as Workshop[]) || [];

  // Trigger continue fetching more resource claims on scroll.
  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (
      scrollRemaining < 500 &&
      !workshopsFetchState?.finished &&
      workshopsFetchState.limit <= workshopsFetchState.filteredItems.length
    ) {
      reduceWorkshopsFetchState({
        type: 'modify',
        limit: workshopsFetchState.limit + FETCH_BATCH_LIMIT,
      });
    }
  };

  function filterWorkshop(workshop: Workshop): boolean {
    // Hide anything pending deletion
    if (workshop.metadata.deletionTimestamp) {
      return false;
    }
    if (keywordFilter) {
      for (const keyword of keywordFilter) {
        if (!keywordMatch(workshop, keyword)) {
          return false;
        }
      }
    }
    return true;
  }

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

  async function fetchWorkshops(): Promise<void> {
    const workshopList: WorkshopList = await listWorkshops({
      continue: workshopsFetchState.continue,
      limit: FETCH_BATCH_LIMIT,
      namespace: workshopsFetchState.namespace,
    });
    if (!workshopsFetchState.activity.canceled) {
      reduceWorkshopsFetchState({
        type: 'post',
        k8sObjectList: workshopList,
        refreshInterval: 10000,
        refresh: (): void => {
          reduceWorkshopsFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function onWorkshopDeleteConfirm(): Promise<void> {
    const deletedWorkshops: Workshop[] = [];
    if (modalState.workshop) {
      await deleteWorkshop(modalState.workshop);
      deletedWorkshops.push(modalState.workshop);
    } else {
      for (const workshop of workshops) {
        if (selectedUids.includes(workshop.metadata.uid)) {
          await deleteWorkshop(workshop);
          deletedWorkshops.push(workshop);
        }
      }
    }
    reduceWorkshopsFetchState({
      type: 'removeItems',
      items: deletedWorkshops,
    });
    setModalState({});
  }

  // Track unmount for other effect cleanups
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Trigger user namespaces fetch for admin.
  useEffect(() => {
    if (userIsAdmin) {
      reduceUserNamespacesFetchState({ type: 'startFetch' });
    }
  }, [userIsAdmin]);

  // Fetch or continue fetching user namespaces
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

  // Fetch or continue fetching resource claims
  useEffect(() => {
    if (
      workshopsFetchState?.canContinue &&
      (workshopsFetchState.refreshing || workshopsFetchState.filteredItems.length < workshopsFetchState.limit)
    ) {
      fetchWorkshops();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(workshopsFetchState);
      }
    };
  }, [workshopsFetchState]);

  // Reload on filter change
  useEffect(() => {
    if (!workshopsFetchState || JSON.stringify(fetchNamespaces) !== JSON.stringify(workshopsFetchState?.namespaces)) {
      reduceWorkshopsFetchState({
        type: 'startFetch',
        filter: filterWorkshop,
        limit: FETCH_BATCH_LIMIT,
        namespaces: fetchNamespaces,
      });
    } else if (workshopsFetchState) {
      reduceWorkshopsFetchState({
        type: 'modify',
        filter: filterWorkshop,
      });
    }
  }, [JSON.stringify(fetchNamespaces), JSON.stringify(keywordFilter)]);

  // Show loading until whether the user is admin is determined.
  if (userIsAdmin === null || (userIsAdmin && !userNamespacesFetchState?.finished)) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }

  if (serviceNamespaces.length === 0) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No Service Access
          </Title>
          <EmptyStateBody>Your account has no access to services.</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (serviceNamespaces.length === 1 && !serviceNamespaceName) {
    return <Redirect to={`/workshops/${serviceNamespaces[0].name}`} />;
  }

  return (
    <>
      {modalState?.action === 'delete' ? (
        <WorkshopDeleteModal
          key="deleteModal"
          isOpen={true}
          onClose={() => setModalState({})}
          onConfirm={onWorkshopDeleteConfirm}
          workshop={modalState.workshop}
        />
      ) : null}
      {serviceNamespaces.length > 1 ? (
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
      <PageSection key="head" className="workshops-head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            {serviceNamespaces.length > 1 && serviceNamespaceName ? (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/workshops" className={className}>
                      Workshops
                    </Link>
                  )}
                />
                <BreadcrumbItem>{serviceNamespace?.displayName || serviceNamespaceName}</BreadcrumbItem>
              </Breadcrumb>
            ) : (
              <Breadcrumb>
                <BreadcrumbItem>Workshops</BreadcrumbItem>
              </Breadcrumb>
            )}
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search..."
              onSearch={(value) => {
                if (value) {
                  urlSearchParams.set('search', value.join(' '));
                } else if (urlSearchParams.has('search')) {
                  urlSearchParams.delete('search');
                }
                history.push(`${location.pathname}?${urlSearchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <WorkshopActions
              isDisabled={selectedUids.length === 0}
              position="right"
              workshopName="Selected"
              actionHandlers={{
                delete: () => setModalState({ modal: 'action', action: 'delete' }),
              }}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {workshops.length === 0 ? (
        workshopsFetchState?.finished ? (
          <PageSection key="workshops-list-empty">
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                No workshops found.
              </Title>
              {keywordFilter ? (
                <EmptyStateBody>No workshops matched search.</EmptyStateBody>
              ) : sessionServiceNamespaces.find((ns) => ns.name == serviceNamespaceName) ? (
                <EmptyStateBody>
                  Request workshops using the <Link to="/catalog">catalog</Link>.
                </EmptyStateBody>
              ) : null}
            </EmptyState>
          </PageSection>
        ) : (
          <PageSection key="workshops-list-loading">
            <EmptyState variant="full">
              <EmptyStateIcon icon={LoadingIcon} />
            </EmptyState>
          </PageSection>
        )
      ) : (
        <PageSection key="body" className="workshops-list" variant={PageSectionVariants.light}>
          <SelectableTable
            columns={(serviceNamespaceName ? [] : ['Project']).concat([
              'Name',
              'Registration',
              'Users',
              'Created At',
              'Actions',
            ])}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                setSelectedUids(workshops.map((workshop) => workshop.metadata.uid));
              } else {
                setSelectedUids([]);
              }
            }}
            rows={workshops.map((workshop: Workshop) => {
              const actionHandlers = {
                delete: () => setModalState({ action: 'delete', modal: 'action', workshop: workshop }),
              };

              const workshopServiceNamespace: ServiceNamespace = serviceNamespaces.find(
                (ns: ServiceNamespace) => ns.name === workshop.metadata.namespace
              );
              const totalUserAssignments: number = workshop.spec.userAssignments
                ? workshop.spec.userAssignments.length
                : null;
              const claimedUserAssignments: number = workshop.spec.userAssignments
                ? workshop.spec.userAssignments.filter((item) => item.assignment).length
                : null;
              const ownerReference = workshop.metadata?.ownerReferences?.[0];
              const owningResourceClaimName =
                ownerReference && ownerReference.kind === 'ResourceClaim' ? ownerReference.name : null;

              // Only include project/namespace column if namespace is not selected.
              const cells: any[] = serviceNamespaceName
                ? []
                : [
                    <>
                      <Link key="workshops" to={`/workshops/${workshop.metadata.namespace}`}>
                        {workshopServiceNamespace?.displayName || workshop.metadata.namespace}
                      </Link>
                      {userIsAdmin ? (
                        <OpenshiftConsoleLink key="console" resource={workshop} linkToNamespace={true} />
                      ) : null}
                    </>,
                  ];

              // Add other columns
              cells.push(
                // Name
                <>
                  <Link
                    key="workshops"
                    to={
                      owningResourceClaimName
                        ? `/services/${workshop.metadata.namespace}/${owningResourceClaimName}/workshop`
                        : `/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`
                    }
                  >
                    {displayName(workshop)}
                  </Link>
                  {userIsAdmin ? <OpenshiftConsoleLink key="console" resource={workshop} /> : null}
                </>,
                // Registration
                <>{workshop.spec.openRegistration === false ? 'Pre-registration' : 'Open'}</>,
                // Users
                <>{totalUserAssignments ? `${claimedUserAssignments}/${totalUserAssignments}` : <p>-</p>}</>,
                // Created At
                <>
                  <LocalTimestamp key="timestamp" timestamp={workshop.metadata.creationTimestamp} />
                  <br key="break" />
                  (<TimeInterval key="interval" toTimestamp={workshop.metadata.creationTimestamp} />)
                </>,
                // Actions
                <>
                  <WorkshopActions position="right" workshop={workshop} actionHandlers={actionHandlers} />
                </>
              );
              return {
                cells: cells,
                onSelect: (isSelected) =>
                  setSelectedUids((uids) => {
                    if (isSelected) {
                      if (uids.includes(workshop.metadata.uid)) {
                        return uids;
                      } else {
                        return [...uids, workshop.metadata.uid];
                      }
                    } else {
                      return uids.filter((uid) => uid !== workshop.metadata.uid);
                    }
                  }),
                selected: selectedUids.includes(workshop.metadata.uid),
              };
            })}
          />
        </PageSection>
      )}
    </>
  );
};

export default WorkshopsList;
