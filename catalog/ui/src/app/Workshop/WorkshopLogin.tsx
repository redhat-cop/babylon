import React, { useState } from 'react';
import {
  ActionGroup,
  Button,
  Form,
  FormGroup,
  PageSection,
  PageSectionVariants,
  Popover,
  Radio,
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
import { CountryDropdown } from 'react-country-region-selector';

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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState('');
  const [company, setCompany] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [department, setDepartment] = useState('');
  const [emailValidated, setEmailValidated] = useState<validateType>('default');
  const [notifyMe, setNotifyMe] = useState('notifyMe');
  const detailsRequired = notifyMe === 'notifyMe';
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
            <FormGroup fieldId="firstName" label="First Name">
              <TextInput type="text" id="firstName" onChange={(v) => setFirstName(v)} value={firstName} />
            </FormGroup>
            <FormGroup fieldId="lastName" label="Last Name">
              <TextInput type="text" id="lastName" onChange={(v) => setLastName(v)} value={lastName} />
            </FormGroup>
            <FormGroup fieldId="country" isRequired={detailsRequired} label="Country">
              <CountryDropdown value={country} onChange={(val) => setCountry(val)} />
            </FormGroup>
            <FormGroup fieldId="company" isRequired={detailsRequired} label="Company">
              <TextInput
                type="text"
                id="company"
                isRequired={detailsRequired}
                onChange={(v) => setCompany(v)}
                value={company}
              />
            </FormGroup>
            <FormGroup fieldId="jobRole" label="Job Role">
              <TextInput type="text" id="jobRole" onChange={(v) => setJobRole(v)} value={jobRole} />
            </FormGroup>
            <FormGroup fieldId="department" label="Department">
              <TextInput type="text" id="department" onChange={(v) => setDepartment(v)} value={department} />
            </FormGroup>
            <FormGroup fieldId="notify" style={{ marginTop: 'var(--pf-global--spacer--sm)' }}>
              <div>
                <p className="workshop-login__checkbox-description">
                  Red Hat may use your personal data to inform you about its products, services, and events.
                </p>
              </div>
              <div className="workshop-login__checkbox">
                <Radio
                  id="notify-me"
                  name="notify"
                  label="Notify me about products, services, and events."
                  isChecked={notifyMe === 'notifyMe'}
                  onChange={() => setNotifyMe('notifyMe')}
                />
              </div>
              <div>
                <Radio
                  className="workshop-login__checkbox"
                  id="unsubscribe-me"
                  name="notify"
                  label="Unsubscribe me from all marketing communications about Red Hat products, services, and events, including event invitations. "
                  isChecked={notifyMe === 'unsubscribeMe'}
                  onChange={() => setNotifyMe('unsubscribeMe')}
                />
              </div>
              <div>
                <p className="workshop-login__checkbox-description">
                  You can stop receiving marketing emails by clicking the unsubscribe link in each email or withdraw
                  your consent at any time in the{' '}
                  <a
                    href="https://engage.redhat.com/Global-Preference-Center#unsubscribe_here"
                    target="_blank"
                    rel="external"
                  >
                    preference center
                  </a>
                  . See{' '}
                  <a href="https://www.redhat.com/en/about/privacy-policy" target="_blank" rel="external">
                    Privacy Statement
                  </a>{' '}
                  for details.
                </p>
              </div>
            </FormGroup>
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
