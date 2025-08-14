import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useSWRInfinite from 'swr/infinite';
import {
  EmptyState,
  EmptyStateBody,
  PageSection,
  Split,
  SplitItem,
  Title,
  EmptyStateFooter,
  Button,
  Card,
  CardBody,
  Grid,
  GridItem,
  Divider,
} from '@patternfly/react-core';
import PlusIcon from '@patternfly/react-icons/dist/js/icons/plus-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import CalendarAltIcon from '@patternfly/react-icons/dist/js/icons/calendar-alt-icon';
import UsersIcon from '@patternfly/react-icons/dist/js/icons/users-icon';
import { apiPaths, fetcher } from '@app/api';
import { MultiWorkshop, MultiWorkshopList as MultiWorkshopListType } from '@app/types';
import { compareK8sObjectsArr, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';
import useSession from '@app/utils/useSession';

import './multiworkshop-list.css';
import { Chip } from '@patternfly/react-core/deprecated';

function keywordMatch(multiworkshop: MultiWorkshop, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  if (
    multiworkshop.metadata.name.includes(keywordLowerCased) ||
    multiworkshop.metadata.namespace.includes(keywordLowerCased) ||
    (multiworkshop.spec.description && multiworkshop.spec.description.toLowerCase().includes(keywordLowerCased)) ||
    (multiworkshop.spec.displayName && multiworkshop.spec.displayName.toLowerCase().includes(keywordLowerCased))
  ) {
    return true;
  }
  return false;
}

const MultiWorkshopList: React.FC = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();
  const { userNamespace } = useSession().getSession();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Use namespace from params or fall back to user's namespace
  const currentNamespace = namespace || userNamespace?.name;
  
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

  const {
    data: multiworkshopsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<MultiWorkshopListType>(
    (index, previousPageData) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.MULTIWORKSHOPS({ namespace: currentNamespace, limit: FETCH_BATCH_LIMIT, continueId });
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
  
  const isReachingEnd = multiworkshopsPages && !multiworkshopsPages[multiworkshopsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !multiworkshopsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && multiworkshopsPages && typeof multiworkshopsPages[size - 1] === 'undefined');

  const filterMultiWorkshop = useCallback(
    (multiworkshop: MultiWorkshop): boolean => {
      // Hide anything pending deletion
      if (multiworkshop.metadata.deletionTimestamp) {
        return false;
      }
      if (keywordFilter) {
        for (const keyword of keywordFilter) {
          if (!keywordMatch(multiworkshop, keyword)) {
            return false;
          }
        }
      }
      return true;
    },
    [keywordFilter],
  );

  const multiworkshops: MultiWorkshop[] = useMemo(
    () => [].concat(...multiworkshopsPages.map((page) => page.items)).filter(filterMultiWorkshop) || [],
    [filterMultiWorkshop, multiworkshopsPages],
  );

  // Trigger continue fetching more resource claims on scroll.
  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  function getMultiWorkshopDisplayName(multiworkshop: MultiWorkshop): string {
    return multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  }

  function getStatusColor(multiworkshop: MultiWorkshop): 'blue' | 'green' | 'orange' | 'red' | 'grey' {
    const now = new Date();
    const startDate = multiworkshop.spec.startDate ? new Date(multiworkshop.spec.startDate) : null;
    const endDate = multiworkshop.spec.endDate ? new Date(multiworkshop.spec.endDate) : null;
    
    if (startDate && endDate) {
      if (now < startDate) return 'blue'; // Upcoming
      if (now > endDate) return 'grey'; // Ended
      return 'green'; // Active
    }
    
    return 'orange'; // No dates set
  }

  function getStatusText(multiworkshop: MultiWorkshop): string {
    const now = new Date();
    const startDate = multiworkshop.spec.startDate ? new Date(multiworkshop.spec.startDate) : null;
    const endDate = multiworkshop.spec.endDate ? new Date(multiworkshop.spec.endDate) : null;
    
    if (startDate && endDate) {
      if (now < startDate) return 'Upcoming';
      if (now > endDate) return 'Ended';
      return 'Active';
    }
    
    return 'No Schedule';
  }

  if (!currentNamespace) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No namespace available" variant="full">
          <EmptyStateBody>Please ensure you have a valid namespace to view multi-workshops.</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <div onScroll={scrollHandler} style={{ height: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <PageSection hasBodyWrapper={false} key="header" variant="default" className="multiworkshop-list__header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h1" size="2xl">
              Event Wizard
            </Title>
            <p className="multiworkshop-list__header-subtitle">
              Create and manage your event workshop collections in {currentNamespace}
            </p>
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search events..."
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
            <Button 
              variant="primary" 
              icon={<PlusIcon />}
              onClick={() => navigate('/event-wizard/create')}
            >
              Create Event
            </Button>
          </SplitItem>
        </Split>
      </PageSection>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {multiworkshops.length === 0 ? (
          <PageSection hasBodyWrapper={false} key="multiworkshops-list-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No events found" variant="full">
              <EmptyStateFooter>
                {keywordFilter ? (
                  <EmptyStateBody>No events matched your search criteria.</EmptyStateBody>
                ) : (
                  <EmptyStateBody>
                    Get started by creating your first event to organize multiple workshop sessions.
                  </EmptyStateBody>
                )}
                <Button 
                  variant="primary" 
                  icon={<PlusIcon />}
                  onClick={() => navigate('/event-wizard/create')}
                >
                  Create Event
                </Button>
              </EmptyStateFooter>
            </EmptyState>
          </PageSection>
        ) : (
          <PageSection hasBodyWrapper={false} key="body">
            <Grid hasGutter>
              {multiworkshops.map((multiworkshop: MultiWorkshop) => (
                <GridItem key={multiworkshop.metadata.uid} span={12} md={6} lg={4}>
                  <Card 
                    className="multiworkshop-list__card"
                    isSelectable 
                    isSelected={false}
                    onClick={() => navigate(`/multiworkshops/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`)}
                    style={{ height: '100%', cursor: 'pointer' }}
                  >
                    <CardBody>
                      <Split hasGutter>
                        <SplitItem isFilled>
                          <Title headingLevel="h3" size="lg" className="multiworkshop-list__card-title">
                            {getMultiWorkshopDisplayName(multiworkshop)}
                          </Title>
                        </SplitItem>
                        <SplitItem>
                          <Chip className="multiworkshop-list__status-chip" color={getStatusColor(multiworkshop)} isReadOnly>
                            {getStatusText(multiworkshop)}
                          </Chip>
                        </SplitItem>
                      </Split>
                      
                      {multiworkshop.spec.description && (
                        <p className="multiworkshop-list__card-description">
                          {multiworkshop.spec.description}
                        </p>
                      )}

                      <Divider style={{ margin: '12px 0' }} />

                      <div className="multiworkshop-list__card-meta">
                        <Split hasGutter style={{ marginBottom: '8px' }}>
                          <SplitItem>
                            <UsersIcon style={{ marginRight: '4px' }} />
                            {multiworkshop.spec.assets ? multiworkshop.spec.assets.length : 0} workshops
                          </SplitItem>
                          <SplitItem>
                            <UsersIcon style={{ marginRight: '4px' }} />
                            {multiworkshop.spec.numberSeats || 'N/A'} seats
                          </SplitItem>
                        </Split>

                        {multiworkshop.spec.startDate && (
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                            <CalendarAltIcon style={{ marginRight: '4px' }} />
                            <span style={{ fontSize: '13px', color: 'var(--pf-t--color--text--secondary)' }}>
                              Starts: <LocalTimestamp timestamp={multiworkshop.spec.startDate} />
                            </span>
                          </div>
                        )}

                        <div style={{ fontSize: '13px', color: 'var(--pf-t--color--text--secondary)', marginTop: '8px' }}>
                          Created <TimeInterval toTimestamp={multiworkshop.metadata.creationTimestamp} />
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </GridItem>
              ))}
            </Grid>
          </PageSection>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default MultiWorkshopList;
