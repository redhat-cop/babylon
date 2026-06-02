import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import {
  EmptyState,
  EmptyStateBody,
  PageSection,
  Split,
  SplitItem,
  Title,
  EmptyStateFooter,
} from '@patternfly/react-core';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, deleteSelfPacedLab, fetcher } from '@app/api';
import { SelfPacedLab, SelfPacedLabList } from '@app/types';
import { compareK8sObjectsArr, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import Modal, { useModal } from '@app/Modal/Modal';
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';

function keywordMatch(selfPacedLab: SelfPacedLab, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  if (
    selfPacedLab.metadata.name.includes(keywordLowerCased) ||
    selfPacedLab.metadata.namespace.includes(keywordLowerCased) ||
    (selfPacedLab.spec.description && selfPacedLab.spec.description.toLowerCase().includes(keywordLowerCased)) ||
    displayName(selfPacedLab).toLowerCase().includes(keywordLowerCased)
  ) {
    return true;
  }
  return false;
}

const SelfPacedLabs: React.FC = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();
  const [modalAction, openModalAction] = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const keywordFilter = useMemo(
    () =>
      searchParams.has('search')
        ? searchParams
            .get('search')
            .trim()
            .split(/ +/)
            .filter((w) => w != '')
        : null,
    [searchParams.get('search')],
  );
  const [modalState, setModalState] = useState<{ action?: string; selfPacedLab?: SelfPacedLab }>({});
  const [selectedUids, setSelectedUids] = useState([]);
  const { cache } = useSWRConfig();
  const showModal = useCallback(
    ({ action, selfPacedLab }: { action: string; selfPacedLab?: SelfPacedLab }) => {
      setModalState({ action, selfPacedLab });
      openModalAction();
    },
    [openModalAction],
  );

  const {
    data: selfPacedLabsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<SelfPacedLabList>(
    (index, previousPageData) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.SELF_PACED_LABS({ namespace, limit: FETCH_BATCH_LIMIT, continueId });
    },
    fetcher,
    {
      refreshInterval: 8000,
      revalidateFirstPage: true,
      revalidateAll: true,
      compare: (currentData, newData) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.length === 0) return false;
        if (!newData || newData.length === 0) return false;
        if (currentData.length !== newData.length) return false;
        for (let i = 0; i < currentData.length; i++) {
          if (!compareK8sObjectsArr(currentData[i].items, newData[i].items)) return false;
        }
        return true;
      },
    },
  );
  const isReachingEnd = selfPacedLabsPages && !selfPacedLabsPages[selfPacedLabsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !selfPacedLabsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && selfPacedLabsPages && typeof selfPacedLabsPages[size - 1] === 'undefined');

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: SelfPacedLab[]; action: 'update' | 'delete' }) => {
      const pagesCpy = JSON.parse(JSON.stringify(selfPacedLabsPages));
      let p: SelfPacedLabList;
      let i: number;
      for ([i, p] of pagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              pagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              pagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(pagesCpy);
          }
        }
      }
    },
    [mutate, selfPacedLabsPages],
  );
  const filterSelfPacedLab = useCallback(
    (selfPacedLab: SelfPacedLab): boolean => {
      if (selfPacedLab.metadata.deletionTimestamp) {
        return false;
      }
      if (keywordFilter) {
        for (const keyword of keywordFilter) {
          if (!keywordMatch(selfPacedLab, keyword)) {
            return false;
          }
        }
      }
      return true;
    },
    [keywordFilter],
  );

  const selfPacedLabs: SelfPacedLab[] = useMemo(
    () => [].concat(...selfPacedLabsPages.map((page) => page.items)).filter(filterSelfPacedLab) || [],
    [filterSelfPacedLab, selfPacedLabsPages],
  );

  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  async function onDeleteConfirm(): Promise<void> {
    const deletedItems: SelfPacedLab[] = [];
    if (modalState.selfPacedLab) {
      await deleteSelfPacedLab(modalState.selfPacedLab);
      deletedItems.push(modalState.selfPacedLab);
    } else {
      for (const selfPacedLab of selfPacedLabs) {
        if (selectedUids.includes(selfPacedLab.metadata.uid)) {
          await deleteSelfPacedLab(selfPacedLab);
          cache.delete(
            apiPaths.SELF_PACED_LAB({
              namespace: selfPacedLab.metadata.namespace,
              selfPacedLabName: selfPacedLab.metadata.name,
            }),
          );
          deletedItems.push(selfPacedLab);
        }
      }
    }
    revalidate({ updatedItems: deletedItems, action: 'delete' });
  }

  return (
    <div onScroll={scrollHandler} className="admin-container">
      <Modal
        ref={modalAction}
        onConfirm={onDeleteConfirm}
        title={
          modalState.selfPacedLab
            ? `Delete self-paced lab ${displayName(modalState.selfPacedLab)}?`
            : 'Delete selected self-paced labs?'
        }
      >
        <p>Provisioned resources will be deleted.</p>
      </Modal>
      <PageSection hasBodyWrapper={false} key="header" className="admin-header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Self-Paced Labs
            </Title>
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => {
                navigate(`/admin/selfpacedlabs/${n.name}?${searchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search..."
              onSearch={(value) => {
                if (value) {
                  searchParams.set('search', value.join(' '));
                } else if (searchParams.has('search')) {
                  searchParams.delete('search');
                }
                setSearchParams(searchParams);
              }}
            />
          </SplitItem>
          <SplitItem>
            <ButtonCircleIcon
              isDisabled={selectedUids.length === 0}
              onClick={() => showModal({ action: 'delete' })}
              description="Delete selected"
              icon={TrashIcon}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {selfPacedLabs.length === 0 ? (
        <PageSection hasBodyWrapper={false} key="selfpacedlabs-list-empty">
          <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No self-paced labs found." variant="full">
            <EmptyStateFooter>
              {keywordFilter ? (
                <EmptyStateBody>No self-paced labs matched search.</EmptyStateBody>
              ) : (
                <EmptyStateBody>
                  Request self-paced labs using the <Link to="/catalog">catalog</Link>.
                </EmptyStateBody>
              )}
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection hasBodyWrapper={false} key="body" className="admin-body">
          <SelectableTable
            columns={['Name', 'Service Namespace', 'Registration', 'Created At', 'Actions']}
            onSelectAll={(isSelected: boolean) => {
              if (isSelected) {
                setSelectedUids(selfPacedLabs.map((s) => s.metadata.uid));
              } else {
                setSelectedUids([]);
              }
            }}
            rows={selfPacedLabs.map((selfPacedLab: SelfPacedLab) => {
              const actionHandlers = {
                delete: () => showModal({ action: 'delete', selfPacedLab }),
              };

              const cells: unknown[] = [];
              cells.push(
                <>
                  <Link
                    key="selfpacedlab"
                    to={`/selfpacedlabs/${selfPacedLab.metadata.namespace}/${selfPacedLab.metadata.name}`}
                  >
                    {displayName(selfPacedLab)}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={selfPacedLab} />
                </>,
                <>
                  <Link key="service-namespace" to={`/services/${selfPacedLab.metadata.namespace}`}>
                    {selfPacedLab.metadata.namespace}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={selfPacedLab} linkToNamespace={true} />
                </>,
                <>{selfPacedLab.spec.openRegistration === false ? 'Pre-registration' : 'Open'}</>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={selfPacedLab.metadata.creationTimestamp} />
                  <br key="break" />
                  (<TimeInterval key="interval" toTimestamp={selfPacedLab.metadata.creationTimestamp} />)
                </>,
                <React.Fragment key="actions">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 'var(--pf-t--global--spacer--sm)',
                    }}
                  >
                    <ButtonCircleIcon
                      key="actions__delete"
                      onClick={actionHandlers.delete}
                      description="Delete"
                      icon={TrashIcon}
                    />
                  </div>
                </React.Fragment>,
              );
              return {
                cells: cells,
                onSelect: (isSelected) =>
                  setSelectedUids((uids) => {
                    if (isSelected) {
                      if (uids.includes(selfPacedLab.metadata.uid)) {
                        return uids;
                      } else {
                        return [...uids, selfPacedLab.metadata.uid];
                      }
                    } else {
                      return uids.filter((uid) => uid !== selfPacedLab.metadata.uid);
                    }
                  }),
                selected: selectedUids.includes(selfPacedLab.metadata.uid),
              };
            })}
          />
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default SelfPacedLabs;
