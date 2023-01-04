import React, { useCallback, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
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
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, deleteWorkshop, fetcher } from '@app/api';
import { NamespaceList, Workshop, WorkshopList, ServiceNamespace } from '@app/types';
import { compareK8sObjects, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import useSession from '@app/utils/useSession';
import Footer from '@app/components/Footer';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ServiceNamespaceSelect from '@app/components/ServiceNamespaceSelect';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import Modal, { useModal } from '@app/Modal/Modal';
import WorkshopActions from './WorkshopActions';

import './workshops-list.css';

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

const WorkshopsList: React.FC<{
  serviceNamespaceName: string;
}> = ({ serviceNamespaceName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [modalAction, openModalAction] = useModal();
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const enableFetchUserNamespaces = isAdmin; // As admin we need to fetch service namespaces for the service namespace dropdown
  const [modalState, setModalState] = useState<{ action?: string; workshop?: Workshop }>({});
  const [selectedUids, setSelectedUids] = useState([]);
  const { cache } = useSWRConfig();
  const showModal = useCallback(
    ({ action, workshop }: { action: string; workshop?: Workshop }) => {
      setModalState({ action, workshop });
      openModalAction();
    },
    [openModalAction]
  );

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

  const {
    data: workshopsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<WorkshopList>(
    (index, previousPageData: WorkshopList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.WORKSHOPS({ namespace: serviceNamespaceName, limit: FETCH_BATCH_LIMIT, continueId });
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
  const isReachingEnd = workshopsPages && !workshopsPages[workshopsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !workshopsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && workshopsPages && typeof workshopsPages[size - 1] === 'undefined');

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: Workshop[]; action: 'update' | 'delete' }) => {
      const workshopsPagesCpy = JSON.parse(JSON.stringify(workshopsPages));
      let p: WorkshopList;
      let i: number;
      for ([i, p] of workshopsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              workshopsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              workshopsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(workshopsPagesCpy);
          }
        }
      }
    },
    [mutate, workshopsPages]
  );
  const filterWorkshop = useCallback(
    (workshop: Workshop): boolean => {
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
    },
    [keywordFilter]
  );

  const workshops: Workshop[] = useMemo(
    () => [].concat(...workshopsPages.map((page) => page.items)).filter(filterWorkshop) || [],
    [filterWorkshop, workshopsPages]
  );

  // Trigger continue fetching more resource claims on scroll.
  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  async function onWorkshopDeleteConfirm(): Promise<void> {
    const deletedWorkshops: Workshop[] = [];
    if (modalState.workshop) {
      await deleteWorkshop(modalState.workshop);
      deletedWorkshops.push(modalState.workshop);
    } else {
      for (const workshop of workshops) {
        if (selectedUids.includes(workshop.metadata.uid)) {
          await deleteWorkshop(workshop);
          cache.delete(
            apiPaths.WORKSHOP({
              namespace: workshop.metadata.namespace,
              workshopName: workshop.metadata.name,
            })
          );
          deletedWorkshops.push(workshop);
        }
      }
    }
    revalidate({ updatedItems: deletedWorkshops, action: 'delete' });
  }

  if (serviceNamespaces.length === 0) {
    return (
      <>
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No Service Access
            </Title>
            <EmptyStateBody>Your account has no access to services.</EmptyStateBody>
          </EmptyState>
        </PageSection>
        <Footer />
      </>
    );
  }

  if (serviceNamespaces.length === 1 && !serviceNamespaceName) {
    return <Navigate to={`/workshops/${serviceNamespaces[0].name}`} />;
  }

  return (
    <div onScroll={scrollHandler} style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flexGrow: 1 }}>
      <Modal
        ref={modalAction}
        onConfirm={onWorkshopDeleteConfirm}
        title={
          modalState.workshop ? `Delete workshop ${displayName(modalState.workshop)}?` : 'Delete selected workshops?'
        }
      >
        <p>Provisioned services will be deleted.</p>
      </Modal>
      {serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="workshops-list__topbar" variant={PageSectionVariants.light}>
          <ServiceNamespaceSelect
            allowSelectAll
            isPlain
            isText
            selectWorkshopNamespace
            currentNamespaceName={serviceNamespaceName}
            onSelect={(namespace) => {
              if (namespace) {
                navigate(`/workshops/${namespace.name}${location.search}`);
              } else {
                navigate(`/workshops${location.search}`);
              }
            }}
          />
        </PageSection>
      ) : null}
      <PageSection key="head" className="workshops-list__head" variant={PageSectionVariants.light}>
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
                navigate(`${location.pathname}?${urlSearchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <WorkshopActions
              isDisabled={selectedUids.length === 0}
              position="right"
              workshopName="Selected"
              actionHandlers={{
                delete: () => showModal({ action: 'delete' }),
              }}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {workshops.length === 0 ? (
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
        <PageSection key="body" className="workshops-list__body" variant={PageSectionVariants.light}>
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
                delete: () => showModal({ action: 'delete', workshop }),
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
                      {isAdmin ? (
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
                  {isAdmin ? <OpenshiftConsoleLink key="console" resource={workshop} /> : null}
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
                <React.Fragment key="actions">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 'var(--pf-global--spacer--sm)',
                    }}
                  >
                    <ButtonCircleIcon
                      key="actions__delete"
                      onClick={actionHandlers.delete}
                      description="Delete"
                      icon={TrashIcon}
                    />
                  </div>
                </React.Fragment>
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
      <Footer />
    </div>
  );
};

export default WorkshopsList;
