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
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import { WorkshopDetails } from './workshopApi';

type validateType = 'success' | 'warning' | 'error' | 'default';

const WorkshopLogin: React.FC<{
  loginFailureMessage: string;
  onLogin: (email: string, accessPassword: string) => void;
  workshop: WorkshopDetails;
}> = ({ loginFailureMessage, onLogin, workshop }) => {
  const displayName = workshop.displayName || 'Workshop';
  const [accessPassword, setAccessPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailValidated, setEmailValidated] = React.useState<validateType>('default');
  const submitDisabled = (workshop.accessPasswordRequired && !accessPassword) || emailValidated !== 'success';

  const handleEmail = (v: string) => {
    const validate = (email: string): null | validateType => {
      if (!email || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i.test(email)) {
        return 'error';
      }
      return null;
    };
    const errorType = validate(email);
    if (!errorType) {
      setEmail(v);
      setEmailValidated('success');
    } else {
      setEmail(v);
      setEmailValidated(errorType);
    }
  };

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
                <TextInput type="email" id="email" isRequired onChange={handleEmail} value={email} />
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
