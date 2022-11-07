import React, { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Page } from '@patternfly/react-core';
import useSWRImmutable from 'swr/immutable';
import Footer from '@app/components/Footer';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import { apiPaths, fetcher } from './workshop-utils';
import { workshopLogin, WorkshopDetails } from './workshopApi';
import WorkshopAccess from './WorkshopAccess';
import WorkshopHeader from './WorkshopHeader';
import WorkshopLogin from './WorkshopLogin';

import './workshop.css';

const Workshop: React.FC = () => {
  const { workshopId } = useParams();
  const { search } = useLocation();
  const userInterface = new URLSearchParams(search).get('userInterface');
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

  return (
    <Page header={<WorkshopHeader userInterface={userInterface} />} style={{ backgroundColor: '#fff' }}>
      {workshopPrivateInfo.assignment ? (
        <WorkshopAccess workshop={workshopPrivateInfo} />
      ) : (
        <WorkshopLogin
          loginFailureMessage={loginFailureMessage}
          onLogin={(email, accessPassword) => attemptLogin(email, accessPassword)}
          workshop={workshop}
        />
      )}
      <Footer
        rightElement={
          userInterface === 'summit' ? (
            <a href="https://www.redhat.com/summit">
              <img src={summitLogo} alt="Red Hat Summit" width="72px" />
            </a>
          ) : null
        }
      />
    </Page>
  );
};

export default Workshop;
