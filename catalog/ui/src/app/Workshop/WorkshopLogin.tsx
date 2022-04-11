import React from 'react';
import { useState } from 'react';
import { HelpIcon } from '@patternfly/react-icons';

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

import { WorkshopDetails } from './workshopAPI';

interface WorkshopLoginProps {
  loginFailureMessage?: string;
  onLogin: (email: string, accessPassword: string) => void;
  workshop: WorkshopDetails;
}

const WorkshopLogin: React.FunctionComponent<WorkshopLoginProps> = ({ loginFailureMessage, onLogin, workshop }) => {
  const displayName: string = workshop.displayName || 'Workshop';
  const [accessPassword, setAccessPassword] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const submitDisabled = !email || (workshop.accessPasswordRequired && !accessPassword);

  return (
    <PageSection variant={PageSectionVariants.light}>
      <Stack>
        <StackItem>
          <Bullseye>
            <Title headingLevel="h2">{displayName}</Title>
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
                    bodyContent={
                      'Only used for identification purposes during this workshop. ' +
                      'No email messages will be sent to this address.'
                    }
                    headerContent={'Email Address'}
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
                  label="Access Password"
                  labelIcon={
                    <Popover
                      bodyContent={'Access password will be provided by your workshop facilitator.'}
                      headerContent={'Access Password'}
                    >
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
                  Login
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
