import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
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
import { compareK8sObjectsArr, DEMO_DOMAIN, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import ProjectSelector from '@app/components/ProjectSelector';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';

const localizer = momentLocalizer(moment);

import './admin.css';
import '!style-loader!css-loader!react-big-calendar/lib/css/react-big-calendar.css';

type TEvent = {
  title: string;
  start: Date;
  end: Date;
  url: string;
  allDay: boolean;
};

const eventMapper = (workshop: Workshop): TEvent => {
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
    url: owningResourceClaimName
      ? `/services/${workshop.metadata.namespace}/${owningResourceClaimName}/workshop`
      : `/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`,
    allDay: false,
  };
};

const filterOutNonScheduled = (w: Workshop) => {
  return (w.metadata.annotations[`${DEMO_DOMAIN}/scheduled`] === 'true')
};

const eventStyleGetter = (event: TEvent, start: Date, end: Date) => {
  if (start > new Date()) {
    return {
      style: {
        backgroundColor: '#def3ff',
        color: '#002952',
      },
    };
  }

  return {
    style: {
      backgroundColor: '#f3faf2',
      color: '#1e4f18',
    },
  };
};

const WorkshopsScheduled: React.FC<{}> = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();

  const { data: workshops } = useSWR<Workshop[]>(
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
        }),
      ),
    {
      compare: compareK8sObjectsArr,
    },
  );

  return (
    <div className="admin-container">
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Scheduled Workshops
            </Title>
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => {
                navigate(`/admin/scheduled/workshops/${n.name}`);
              }}
            />
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light} className="admin-body" style={{ minHeight: 750 }}>
        <p style={{ padding: '16px 0' }}>Showing only upcoming scheduled workshops.</p>
        <Calendar
          localizer={localizer}
          events={workshops.filter(filterOutNonScheduled).map(eventMapper).filter(Boolean)}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 700 }}
          onSelectEvent={(ev: TEvent) => navigate(ev.url)}
          eventPropGetter={eventStyleGetter}
          showAllEvents={true}
          showMultiDayTimes={true}
        />
      </PageSection>
      <Footer />
    </div>
  );
};

export default WorkshopsScheduled;
