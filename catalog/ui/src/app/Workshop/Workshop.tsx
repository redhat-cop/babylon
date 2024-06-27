import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Page } from '@patternfly/react-core';
import useSWRImmutable from 'swr/immutable';
import Footer from '@app/components/Footer';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import { publicFetcher } from '@app/api';
import useDocumentTitle from '@app/utils/useDocumentTitle';
import { apiPaths } from './workshop-utils';
import { workshopLogin, WorkshopDetails } from './workshopApi';
import WorkshopContent from './WorkshopContent';
import WorkshopHeader from './WorkshopHeader';
import WorkshopLogin from './WorkshopLogin';

import './workshop.css';

const Workshop: React.FC<{ title: string }> = ({ title }) => {
  useDocumentTitle(title);
  const { workshopId } = useParams();
  const [searchParams] = useSearchParams();
  const userInterface = searchParams.get('userInterface') || 'rhpds';
  const [loginFailureMessage, setLoginFailureMessage] = useState('');
  const { data: workshop } = useSWRImmutable<WorkshopDetails>(
    workshopId ? apiPaths.WORKSHOP({ workshopId }) : null,
    publicFetcher,
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
    } catch (error: any) {
      if (error instanceof Error) {
        setLoginFailureMessage(error.message);
      } else {
        setLoginFailureMessage('UNKOWN ERROR');
      }
    }
  }

  return (
    <Page
      header={<WorkshopHeader userInterface={userInterface} />}
      style={{ backgroundColor: 'var(--pf-v5-global--palette--black-200)' }}
      className="workshop"
    >
      {workshopPrivateInfo.assignment ? (
        <WorkshopContent workshop={workshopPrivateInfo} />
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
