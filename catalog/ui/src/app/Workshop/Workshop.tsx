import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Page } from '@patternfly/react-core';
import { workshopLogin, WorkshopDetails } from './workshopApi';
import WorkshopAccess from './WorkshopAccess';
import WorkshopHeader from './WorkshopHeader';
import WorkshopLogin from './WorkshopLogin';
import useSWRImmutable from 'swr/immutable';
import { apiPaths, fetcher } from './workshop-utils';

import './workshop.css';

const Workshop: React.FC = () => {
  const { workshopId } = useParams();
  const [loginFailureMessage, setLoginFailureMessage] = useState('');
  const { data: workshop } = useSWRImmutable<WorkshopDetails>(
    workshopId ? apiPaths.WORKSHOP({ workshopId }) : null,
    fetcher
  );
  const [workshopPrivateInfo, setWorkshopPrivateInfo] = useState(workshop);

  async function attemptLogin(email: string, accessPassword: string) {
    try {
      const workshopPrivateInfo = await workshopLogin({
        accessPassword,
        email,
        workshopId,
      });
      setWorkshopPrivateInfo(workshopPrivateInfo);
      setLoginFailureMessage('');
    } catch (error) {
      if (error instanceof Error) {
        setLoginFailureMessage(error.message);
      } else {
        setLoginFailureMessage('UNKOWN ERROR');
      }
    }
  }

  if (workshopPrivateInfo.assignment) {
    return (
      <Page header={<WorkshopHeader />} className="workshop__page">
        <WorkshopAccess workshop={workshopPrivateInfo} />
      </Page>
    );
  } else {
    return (
      <Page header={<WorkshopHeader />} className="workshop__page">
        <WorkshopLogin
          loginFailureMessage={loginFailureMessage}
          onLogin={(email, accessPassword) => attemptLogin(email, accessPassword)}
          workshop={workshop}
        />
      </Page>
    );
  }
};

export default Workshop;
