import React, { useState } from 'react';
import {
  ActionGroup,
  Bullseye,
  Button,
  Form,
  FormGroup,
  PageSection,
  PageSectionVariants,
  Popover,
  Stack,
  StackItem,
  Text,
  TextInput,
  Title,
} from '@patternfly/react-core';
import HelpIcon from '@patternfly/react-icons/dist/js/icons/help-icon';
import { WorkshopDetails } from './workshopApi';

const WorkshopLogin: React.FC<{
  loginFailureMessage: string;
  onLogin: (email: string, accessPassword: string) => void;
  workshop: WorkshopDetails;
}> = ({ loginFailureMessage, onLogin, workshop }) => {
  const displayName = workshop.displayName || 'Workshop';
  const [accessPassword, setAccessPassword] = useState('');
  const [email, setEmail] = useState('');
  const submitDisabled = !email || (workshop.accessPasswordRequired && !accessPassword);

  return (
    <PageSection variant={PageSectionVariants.light}>
      <Stack hasGutter={true}>
        <StackItem>
          <Bullseye>
            <Title headingLevel="h1" style={{ padding: 'var(--pf-global--spacer--lg) 0' }}>
              {displayName}
            </Title>
          </Bullseye>
        </StackItem>
        <StackItem>
          <Bullseye>
            <Form className="workshop-login-form">
              <FormGroup
                fieldId="email"
                isRequired={true}
                label="Email"
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
                <TextInput id="email" isRequired={true} onChange={setEmail} value={email} />
              </FormGroup>
              {workshop.accessPasswordRequired ? (
                <FormGroup
                  fieldId="accessPassword"
                  isRequired={true}
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
                    isRequired={true}
                    onChange={setAccessPassword}
                    onKeyPress={(event) => {
                      if (event.key === 'Enter' && !submitDisabled) {
                        onLogin(email, accessPassword);
                      }
                    }}
                    type="password"
                    value={accessPassword}
                  />
                </FormGroup>
              ) : null}
              <ActionGroup>
                <Button isDisabled={submitDisabled} onClick={() => onLogin(email, accessPassword)}>
                  Access
                </Button>
              </ActionGroup>
              {loginFailureMessage ? <Text className="workshop-login-failure">{loginFailureMessage}</Text> : null}
            </Form>
          </Bullseye>
        </StackItem>
      </Stack>
    </PageSection>
  );
};

export default WorkshopLogin;
