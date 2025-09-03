import React, { useState } from 'react';
import {
  ActionGroup,
  Button,
  Form,
  FormGroup,
  HelperText,
  PageSection,
  Popover,
  Content,
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
      if (!email || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) return 'error';
      return 'success';
    };
    const errorType = validate(v);
    setEmail(v);
    setEmailValidated(errorType);
  };

  return (
    <PageSection hasBodyWrapper={false}  padding={{ default: 'noPadding' }} className="workshop-login">
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
              labelHelp={
                <Popover
                  bodyContent="Only used for identification purposes during this workshop. No email messages will be sent to this address."
                  headerContent="Email Address"
                >
                  <Button icon={<HelpIcon />} variant="plain" />
                </Popover>
              }
            >
              <TextInput
                type="email"
                id="email"
                placeholder="email@redhat.com"
                isRequired
                onChange={(_event, v: string) => handleEmail(v)}
                value={email}
              />
              {emailValidated === 'error' ? (
                <HelperText>
                  <ExclamationCircleIcon /> Invalid email address
                </HelperText>
              ) : null}
            </FormGroup>
            {workshop.accessPasswordRequired ? (
              <FormGroup
                fieldId="accessPassword"
                isRequired
                label="Workshop Password"
                labelHelp={
                  <Popover bodyContent="Password will be provided by your workshop facilitator.">
                    <Button icon={<HelpIcon />} variant="plain" />
                  </Popover>
                }
              >
                <TextInput
                  id="accessPassword"
                  isRequired
                  onChange={(_event, val) => setAccessPassword(val)}
                  type="password"
                  value={accessPassword}
                />
              </FormGroup>
            ) : null}
            <ActionGroup>
              <Button icon={<ArrowRightIcon />}
                type="submit"
                isDisabled={submitDisabled}
                onClick={(ev: React.FormEvent<HTMLButtonElement>) => {
                  ev.preventDefault();
                  onLogin(email, accessPassword);
                }}
              >
                Access this workshop 
              </Button>
            </ActionGroup>
            <FormGroup>
              {loginFailureMessage ? <Content component="p" className="workshop-login__failure">{loginFailureMessage}</Content> : null}
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
