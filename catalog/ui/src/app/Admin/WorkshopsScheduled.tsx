import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
  EmptyStateHeader,
  EmptyStateFooter,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, fetcherItemsInAllPages } from '@app/api';
import { Workshop } from '@app/types';
import { compareK8sObjectsArr, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import ProjectSelector from '@app/components/ProjectSelector';
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'

const localizer = momentLocalizer(moment)

import './admin.css';
import '!style-loader!css-loader!react-big-calendar/lib/css/react-big-calendar.css';


const eventMapper = (workshop: Workshop) => {
    if (!workshop.spec.actionSchedule?.start) return null;
    if (workshop.spec.actionSchedule?.stop) {
      if (new Date(workshop.spec.actionSchedule.stop) <= new Date()) return null;
    }
    const ownerReference = workshop.metadata?.ownerReferences?.[0];
              const owningResourceClaimName =
                ownerReference && ownerReference.kind === 'ResourceClaim' ? ownerReference.name : null;
    return {
        title: workshop.spec.displayName,
        start: new Date(workshop.spec.actionSchedule?.start),
        end: new Date(workshop.spec.lifespan?.end),
        resource: new Date(workshop.spec.actionSchedule?.start) > new Date ? 'WorkshopScheduled': 'Workshop',
        url: owningResourceClaimName
        ? `/services/${workshop.metadata.namespace}/${owningResourceClaimName}/workshop`
        : `/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`
      }
}

const eventStyleGetter = (event, start: Date, end: Date)  => {
  if (start > new Date()) {
    return { style: {
      backgroundColor: '#def3ff',
      color: '#002952'
    } 
  }
}
  
  return { style: {
    backgroundColor: '#f3faf2',
    color: '#1e4f18'
  }
  }
}

const WorkshopsScheduled: React.FC<{}> = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    data: workshops,
  } = useSWR<Workshop[]>(
apiPaths.WORKSHOPS({
        namespace: namespace,
        limit: 'ALL',
      }),
  () =>
    fetcherItemsInAllPages((continueId) =>
      apiPaths.WORKSHOPS({
        namespace,
        limit: FETCH_BATCH_LIMIT,
        continueId,
      })
    ),
  {
    compare: compareK8sObjectsArr,
  }
  );
console.log(workshops.map(eventMapper).filter(Boolean))
  return (
    <div className="admin-container">
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Workshops
            </Title>
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => {
                navigate(`/admin/workshops/${n.name}?${searchParams.toString()}`);
              }}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {workshops.length === 0 ? (
        <PageSection key="workshops-list-empty">
          <EmptyState variant="full">
            <EmptyStateHeader
              titleText="No workshops found."
              icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
              headingLevel="h1"
            />
            <EmptyStateFooter>
                <EmptyStateBody>No workshops.</EmptyStateBody>
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <Calendar
      localizer={localizer}
      events={workshops.map(eventMapper).filter(Boolean)}
      startAccessor="start"
      endAccessor="end"
      style={{ height: 500 }}
      onSelectEvent={event => navigate(event.url)}
      eventPropGetter={eventStyleGetter}
    />
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default WorkshopsScheduled;
