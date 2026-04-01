import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  PageSection,
  Split,
  SplitItem,
  Title,
  } from '@patternfly/react-core';

import { apiPaths, fetcherItemsInAllPages } from '@app/api';
import { Workshop } from '@app/types';
import { compareK8sObjectsArr, DEMO_DOMAIN, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import ProjectSelector from '@app/components/ProjectSelector';
import { Calendar } from 'react-big-calendar';

import {
  workshopCalendarEventStyleGetter,
  workshopCalendarLocalizer,
  workshopToCalendarEventScheduledPage,
} from '@app/Admin/workshopCalendarEvents';

import './admin.css';
import '!style-loader!css-loader!react-big-calendar/lib/css/react-big-calendar.css';

const filterOutNonScheduled = (w: Workshop) => {
  return (w.metadata.annotations[`${DEMO_DOMAIN}/scheduled`] === 'true')
};

const WorkshopsScheduled: React.FC = () => {
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
      <PageSection hasBodyWrapper={false} key="header" className="admin-header" >
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
      <PageSection hasBodyWrapper={false} key="body"  className="admin-body" style={{ minHeight: 750 }}>
        <p style={{ padding: '16px 0' }}>Showing only upcoming scheduled workshops.</p>
        <Calendar
          localizer={workshopCalendarLocalizer}
          events={(workshops ?? [])
            .filter(filterOutNonScheduled)
            .map(workshopToCalendarEventScheduledPage)
            .filter(Boolean)}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 700 }}
          onSelectEvent={(ev) => navigate(ev.url)}
          eventPropGetter={workshopCalendarEventStyleGetter}
          showAllEvents={true}
          showMultiDayTimes={true}
        />
      </PageSection>
      <Footer />
    </div>
  );
};

export default WorkshopsScheduled;
