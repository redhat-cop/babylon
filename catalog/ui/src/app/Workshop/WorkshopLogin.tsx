import React, { useState } from 'react';
import {
  ActionGroup,
  Button,
  Form,
  FormGroup,
  HelperText,
  HelperTextItem,
  InputGroup,
  InputGroupItem,
  Popover,
  TextInput,
} from '@patternfly/react-core';
import HelpIcon from '@patternfly/react-icons/dist/js/icons/help-icon';
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

  const hasDescription = description && description.replace(/(<([^>]+)>)/gi, '') !== '';

  return (
    <div className="workshop-login">
      <Hero image={heroImg} overlay compact>
        <h1 className="workshop-login__hero-title">{displayName}</h1>
      </Hero>
      <section className="workshop-login__body">
        <div className={`workshop-login__layout${hasDescription ? ' workshop-login__layout--with-desc' : ''}`}>
          <div className="workshop-login__card">
            <h2 className="workshop-login__card-title">Access this workshop</h2>
            <Form className="workshop-login__form">
              <FormGroup fieldId="email" isRequired label="Email">
                <InputGroup>
                  <InputGroupItem isFill>
                    <TextInput
                      type="email"
                      id="email"
                      placeholder="email@redhat.com"
                      isRequired
                      onChange={(_event, v: string) => handleEmail(v)}
                      value={email}
                    />
                  </InputGroupItem>
                  <InputGroupItem>
                    <Popover
                      bodyContent="Only used for identification purposes during this workshop. No email messages will be sent to this address."
                      headerContent="Email Address"
                    >
                      <Button icon={<HelpIcon />} variant="control" className="workshop-login__help-btn" />
                    </Popover>
                  </InputGroupItem>
                </InputGroup>
                {emailValidated === 'error' ? (
                  <HelperText>
                    <HelperTextItem variant="error">
                      Invalid email address
                    </HelperTextItem>
                  </HelperText>
                ) : null}
              </FormGroup>
              {workshop.accessPasswordRequired ? (
                <FormGroup fieldId="accessPassword" isRequired label="Workshop Password">
                  <InputGroup>
                    <InputGroupItem isFill>
                      <TextInput
                        id="accessPassword"
                        isRequired
                        onChange={(_event, val) => setAccessPassword(val)}
                        type="password"
                        value={accessPassword}
                      />
                    </InputGroupItem>
                    <InputGroupItem>
                      <Popover bodyContent="Password will be provided by your workshop facilitator.">
                        <Button icon={<HelpIcon />} variant="control" className="workshop-login__help-btn" />
                      </Popover>
                    </InputGroupItem>
                  </InputGroup>
                </FormGroup>
              ) : null}
              <ActionGroup>
                <Button
                  icon={<ArrowRightIcon />}
                  type="submit"
                  isDisabled={submitDisabled}
                  isBlock
                  onClick={(ev: React.FormEvent<HTMLButtonElement>) => {
                    ev.preventDefault();
                    onLogin(email, accessPassword);
                  }}
                >
                  Access this workshop
                </Button>
              </ActionGroup>
              {loginFailureMessage ? (
                <p className="workshop-login__failure">{loginFailureMessage}</p>
              ) : null}
            </Form>
          </div>
          {hasDescription ? (
            <aside className="workshop-login__description">
              <div className="workshop-login__description-card">
                {renderEditor ? (
                  <EditorViewer value={description} />
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: renderContent(description, { format: 'html' }) }} />
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default WorkshopLogin;
