import React, { useState } from 'react';
import {
  ActionGroup,
  Button,
  Form,
  FormGroup,
  PageSection,
  PageSectionVariants,
  Popover,
  Text,
  TextInput,
  Title,
} from '@patternfly/react-core';
import HelpIcon from '@patternfly/react-icons/dist/js/icons/help-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import ArrowRightIcon from '@patternfly/react-icons/dist/js/icons/arrow-right-icon';
import Hero from '@app/components/Hero';
import heroImg from '@app/bgimages/hero-img.jpeg';
import EditorViewer from '@app/components/Editor/EditorViewer';
import { WorkshopDetails } from './workshopApi';
import { renderContent } from '@app/util';

import './workshop-login.css';

type validateType = 'success' | 'warning' | 'error' | 'default';

const WorkshopLogin: React.FC<{
  loginFailureMessage: string;
  onLogin: (email: string, accessPassword: string) => void;
  workshop: WorkshopDetails;
}> = ({ loginFailureMessage, onLogin, workshop }) => {
  const displayName = workshop.displayName || 'Workshop';
  const description = workshop.description;
  let renderEditor = true;
  try {
    JSON.parse(description);
  } catch {
    renderEditor = false;
  }
  const [accessPassword, setAccessPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailValidated, setEmailValidated] = useState<validateType>('default');
  const submitDisabled = (workshop.accessPasswordRequired && !accessPassword) || emailValidated !== 'success';

  const handleEmail = (v: string) => {
    const validate = (email: string): validateType => {
      if (!email || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i.test(email)) return 'error';
      return 'success';
    };
    const errorType = validate(v);
    setEmail(v);
    setEmailValidated(errorType);
  };

  return (
    <PageSection variant={PageSectionVariants.light} padding={{ default: 'noPadding' }} className="workshop-login">
      <Hero image={heroImg}>
        <Title headingLevel="h1" size="xl" style={{ fontSize: '40px' }}>
          <b>{displayName}</b>
        </Title>
      </Hero>
      <Form className="workshop-login__form">
        <Title
          headingLevel="h3"
          className="workshop-login__title"
          style={{
            justifyContent: description && description.replace(/(<([^>]+)>)/gi, '') !== '' ? 'flex-start' : 'center',
          }}
        >
          Access to {displayName}
        </Title>
        <div
          className="workshop-login__form-wrapper"
          style={{
            justifyContent: description && description.replace(/(<([^>]+)>)/gi, '') !== '' ? 'flex-start' : 'center',
          }}
        >
          <div className="workshop-login__form-content">
            <FormGroup
              fieldId="email"
              isRequired
              label="Email"
              helperTextInvalid="Invalid email address"
              helperTextInvalidIcon={<ExclamationCircleIcon />}
              validated={emailValidated}
              labelIcon={
                <Popover
                  bodyContent="Only used for identification purposes during this workshop. No email messages will be sent to this address."
                  headerContent="Email Address"
                >
                  <Button variant="plain">
                    <HelpIcon />
                  </Button>
                </Popover>
              }
            >
              <TextInput
                type="email"
                id="email"
                placeholder="email@redhat.com"
                isRequired
                onChange={handleEmail}
                value={email}
              />
            </FormGroup>
            {workshop.accessPasswordRequired ? (
              <FormGroup
                fieldId="accessPassword"
                isRequired
                label="Workshop Password"
                labelIcon={
                  <Popover bodyContent="Password will be provided by your workshop facilitator.">
                    <Button variant="plain">
                      <HelpIcon />
                    </Button>
                  </Popover>
                }
              >
                <TextInput
                  id="accessPassword"
                  isRequired
                  onChange={setAccessPassword}
                  type="password"
                  value={accessPassword}
                />
              </FormGroup>
            ) : null}
            <ActionGroup>
              <Button
                type="submit"
                isDisabled={submitDisabled}
                onClick={(ev: React.FormEvent<HTMLButtonElement>) => {
                  ev.preventDefault();
                  onLogin(email, accessPassword);
                }}
              >
                Access this workshop <ArrowRightIcon />
              </Button>
            </ActionGroup>
            <FormGroup>
              {loginFailureMessage ? <Text className="workshop-login__failure">{loginFailureMessage}</Text> : null}
            </FormGroup>
          </div>
          {description ? (
            <aside className="workshop-login__description">
              <div>
                {renderEditor ? (
                  <EditorViewer value={description} />
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: renderContent(description, { format: 'html' }) }} />
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </Form>
    </PageSection>
  );
};

export default WorkshopLogin;
