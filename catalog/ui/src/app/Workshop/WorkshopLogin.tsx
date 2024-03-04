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
  Select,
  SelectOption,
  SelectVariant,
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
  const [jobRoleIsOpen, setJobRoleIsOpen] = useState(false);
  const [departmentIsOpen, setDepartmentIsOpen] = useState(false);
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
            <FormGroup fieldId="firstName" label="First Name" isRequired>
              <TextInput type="text" id="firstName" onChange={(v) => setFirstName(v)} value={firstName} isRequired />
            </FormGroup>
            <FormGroup fieldId="lastName" label="Last Name" isRequired>
              <TextInput type="text" id="lastName" onChange={(v) => setLastName(v)} value={lastName} isRequired />
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

            <FormGroup fieldId="jobRole" label="Job Role" isRequired>
              <Select
                isOpen={jobRoleIsOpen}
                onToggle={() => setJobRoleIsOpen((v) => !v)}
                id="jobRole"
                onSelect={(e, v) => {
                  setJobRole(v.toString());
                  setJobRoleIsOpen(false);
                }}
                selections={jobRole || '-'}
                variant={SelectVariant.single}
              >
                <SelectOption key="Account Executive" value="Account Executive">
                  Account Executive
                </SelectOption>
                <SelectOption key="Accounting" value="Accounting">
                  Accounting
                </SelectOption>
                <SelectOption key="Analyst" value="Analyst">
                  Analyst
                </SelectOption>
                <SelectOption key="Architect" value="Architect">
                  Architect
                </SelectOption>
                <SelectOption key="Assistant" value="Assistant">
                  Assistant
                </SelectOption>
                <SelectOption key="Automation Architect" value="Automation Architect">
                  Automation Architect
                </SelectOption>
                <SelectOption key="CDO" value="CDO">
                  CDO
                </SelectOption>
                <SelectOption key="CEO" value="CEO">
                  CEO
                </SelectOption>
                <SelectOption key="CFO" value="CFO">
                  CFO
                </SelectOption>
                <SelectOption key="Chairman" value="Chairman">
                  Chairman
                </SelectOption>
                <SelectOption key="Chief Architect" value="Chief Architect">
                  Chief Architect
                </SelectOption>
                <SelectOption key="Chief Scientist" value="Chief Scientist">
                  Chief Scientist
                </SelectOption>
                <SelectOption key="CIO" value="CIO">
                  CIO
                </SelectOption>
                <SelectOption key="CISO" value="CISO">
                  CISO
                </SelectOption>
                <SelectOption key="CMO" value="CMO">
                  CMO
                </SelectOption>
                <SelectOption key="Compliance Officer" value="Compliance Officer">
                  Compliance Officer
                </SelectOption>
                <SelectOption key="Consultant" value="Consultant">
                  Consultant
                </SelectOption>
                <SelectOption key="COO" value="COO">
                  COO
                </SelectOption>
                <SelectOption key="CTO" value="CTO">
                  CTO
                </SelectOption>
                <SelectOption key="Data Scientist" value="Data Scientist">
                  Data Scientist
                </SelectOption>

                <SelectOption key="Database Administrator" value="Database Administrator">
                  Database Administrator
                </SelectOption>
                <SelectOption key="Developer" value="Developer">
                  Developer
                </SelectOption>
                <SelectOption key="Director" value="Director">
                  Director
                </SelectOption>
                <SelectOption key="Engineer" value="Engineer">
                  Engineer
                </SelectOption>
                <SelectOption key="Executive" value="Executive">
                  Executive
                </SelectOption>

                <SelectOption key="Finance" value="Finance">
                  Finance
                </SelectOption>
                <SelectOption key="General Counsel" value="General Counsel">
                  General Counsel
                </SelectOption>
                <SelectOption key="Industry Analyst" value="Industry Analyst">
                  Industry Analyst
                </SelectOption>
                <SelectOption key="IT Auditor" value="IT Auditor">
                  IT Auditor
                </SelectOption>
                <SelectOption key="Lawyer" value="Lawyer">
                  Lawyer
                </SelectOption>
                <SelectOption key="Legal Services" value="Legal Services">
                  Legal Services
                </SelectOption>
                <SelectOption key="Manager" value="Manager">
                  Manager
                </SelectOption>
                <SelectOption key="Media" value="Media">
                  Media
                </SelectOption>
                <SelectOption key="Network Administrator" value="Network Administrator">
                  Network Administrator
                </SelectOption>
                <SelectOption key="Owner" value="Owner">
                  Owner
                </SelectOption>
                <SelectOption key="Partner" value="Partner">
                  Partner
                </SelectOption>
                <SelectOption key="President" value="President">
                  President
                </SelectOption>
                <SelectOption key="Procurement" value="Procurement">
                  Procurement
                </SelectOption>
                <SelectOption key="Product Manager" value="Product Manager">
                  Product Manager
                </SelectOption>
                <SelectOption key="Programmer" value="Programmer">
                  Programmer
                </SelectOption>
                <SelectOption key="Purchasing" value="Purchasing">
                  Purchasing
                </SelectOption>
                <SelectOption key="Programmer" value="Programmer">
                  Programmer
                </SelectOption>
                <SelectOption key="Solicitor" value="Solicitor">
                  Solicitor
                </SelectOption>
                <SelectOption key="Student" value="Student">
                  Student
                </SelectOption>
                <SelectOption key="System Administrator" value="System Administrator">
                  System Administrator
                </SelectOption>
                <SelectOption key="Vice President" value="Vice President">
                  Vice President
                </SelectOption>
                <SelectOption key="Webmaster" value="Webmaster">
                  Webmaster
                </SelectOption>
              </Select>
            </FormGroup>
            <FormGroup fieldId="department" label="Department" isRequired>
              <Select
                isOpen={departmentIsOpen}
                onToggle={() => setDepartmentIsOpen((v) => !v)}
                id="department"
                onSelect={(e, v) => {
                  setDepartment(v.toString());
                  setDepartmentIsOpen(false);
                }}
                selections={department || '-'}
                variant={SelectVariant.single}
              >
                <SelectOption key="IT - Applications / Development" value="IT - Applications / Development">
                  IT - Applications / Development
                </SelectOption>
                <SelectOption key="IT - Business Intelligence" value="IT - Business Intelligence">
                  IT - Business Intelligence
                </SelectOption>
                <SelectOption key="IT - Database" value="IT - Database">
                  IT - Database
                </SelectOption>
                <SelectOption key="IT - Desktop / Help Desk" value="IT - Desktop / Help Desk">
                  IT - Desktop / Help Desk
                </SelectOption>
                <SelectOption key="IT - Network" value="IT - Network">
                  IT - Network
                </SelectOption>
                <SelectOption key="IT - Operations" value="IT - Operations">
                  IT - Operations
                </SelectOption>
                <SelectOption key="IT - Project Management" value="IT - Project Management">
                  IT - Project Management
                </SelectOption>
                <SelectOption key="IT - Quality / Testing" value="IT - Quality / Testing">
                  IT - Quality / Testing
                </SelectOption>
                <SelectOption key="IT - Risk / Compliance / Security" value="IT - Risk / Compliance / Security">
                  IT - Risk / Compliance / Security
                </SelectOption>
                <SelectOption key="IT - Server / Storage" value="IT - Server / Storage">
                  IT - Server / Storage
                </SelectOption>
                <SelectOption key="IT - Telecom" value="IT - Telecom">
                  IT - Telecom
                </SelectOption>
                <SelectOption key="IT - Web" value="IT - Web">
                  IT - Web
                </SelectOption>
                <SelectOption key="Customer Service/Call Center" value="Customer Service/Call Center">
                  Customer Service/Call Center
                </SelectOption>
                <SelectOption key="Executive Office" value="Executive Office">
                  Executive Office
                </SelectOption>
                <SelectOption key="Finance" value="Finance">
                  Finance
                </SelectOption>
                <SelectOption key="Human Resources" value="Human Resources">
                  Human Resources
                </SelectOption>
                <SelectOption key="Legal" value="Legal">
                  Legal
                </SelectOption>
                <SelectOption key="Marketing Communications" value="Marketing Communications">
                  Marketing Communications
                </SelectOption>
                <SelectOption key="Research & Development" value="Research & Development">
                  Research & Development
                </SelectOption>
                <SelectOption key="Sales" value="Sales">
                  Sales
                </SelectOption>
              </Select>
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
