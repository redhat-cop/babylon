import React from "react";
import { useEffect, useReducer, useState } from "react";
import { useRouteMatch } from 'react-router-dom';

import {
  EmptyState,
  EmptyStateIcon,
  Page,
  PageSection,
  Title,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import LoadingIcon from '@app/components/LoadingIcon';

import {
  getWorkshopDetails,
  workshopLogin,
  WorkshopDetails,
} from './workshopAPI';
import WorkshopAccess from './WorkshopAccess';
import WorkshopHeader from './WorkshopHeader';
import WorkshopLogin from './WorkshopLogin';

import './workshop.css';

async function attemptLogin(
  workshopID: string,
  email: string,
  accessPassword: string,
  setWorkshop: (WorkshopDetails) => void,
  setLoginFailureMessage: (string) => void,
) {
  try {
    const workshop:WorkshopDetails = await workshopLogin({
      accessPassword: accessPassword,
      email: email,
      workshopID: workshopID,
    });
    setLoginFailureMessage(undefined);
    setWorkshop(workshop);
  } catch(error) {
    if (error instanceof Error) {
      setLoginFailureMessage(error.message);
    } else {
      setLoginFailureMessage("UNKOWN ERROR");
    }
  }
}

async function getWorkshop(
  workshopID:string,
  setWorkshop:(Workshop) => void,
) {
  setWorkshop(await getWorkshopDetails(workshopID));
}

const Workshop: React.FunctionComponent = () => {
  const routeMatch = useRouteMatch<any>('/workshop/:workshopID');
  const workshopID:string = routeMatch?.params?.workshopID;
  const [loginFailureMessage, setLoginFailureMessage] = useState<string>(undefined);
  const [workshop, setWorkshop] = useState<WorkshopDetails>(undefined);

  useEffect(() => {
    setWorkshop(undefined);
    if (workshopID) {
      getWorkshop(workshopID, setWorkshop);
    }
  }, [workshopID])

  if (!workshopID) {
    return (
      <Page header={<WorkshopHeader/>}>
        <PageSection>
          <Title headingLevel="h1">No workshop Specified in path.</Title>
        </PageSection>
      </Page>
    );
  }

  if (workshop === undefined) {
    return (
      <Page header={<WorkshopHeader/>}>
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        </PageSection>
      </Page>
    );
  }

  if (workshop === null) {
    return (
      <Page header={<WorkshopHeader/>}>
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1">Workshop ID "{workshopID}" not found.</Title>
          </EmptyState>
        </PageSection>
      </Page>
    );
  }

  if (workshop.assignment) {
    return (
      <Page header={<WorkshopHeader/>}>
        <WorkshopAccess workshop={workshop}/>
      </Page>
    );
  } else {
    return (
      <Page header={<WorkshopHeader/>}>
        <WorkshopLogin
          loginFailureMessage={loginFailureMessage}
          onLogin={
            (email, accessPassword) => {
              attemptLogin(workshopID, email, accessPassword, setWorkshop, setLoginFailureMessage)
            }
          }
          workshop={workshop}
        />
      </Page>
    );
  }
};

export default Workshop;
