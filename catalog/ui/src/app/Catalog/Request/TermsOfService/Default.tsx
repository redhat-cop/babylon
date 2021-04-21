import * as React from 'react';

import {
  Checkbox,
  FormGroup,
} from '@patternfly/react-core';

export interface DefaultTermsOfServiceProps {
  agreed: boolean;
  onChange?: any;
}

const DefaultTermsOfService: React.FunctionComponent<DefaultTermsOfServiceProps> = ({
  agreed,
  onChange,
}) => {
  return (
    <FormGroup label="IMPORTANT PLEASE READ" className="rhpds-catalog__terms-of-service">
      <p>Please pay close attention to the information provided in this page.</p>
      <p>After you order your environment, you can manage it by logging into this system and select Services.</p>
      <p>The ordered environment will cease to run unless you use Extend Runtime in App Control.</p>
      <p>The ordered environment will cease to exist at the Expiration Date time stamp provided unless you use Extend Lifetime in App Control.</p>
      <p>If you have read and understood the above, click the check box below then Submit to continue.</p>
      <Checkbox
        label="I confirm that I understand the above warnings."
        id="terms-of-service"
        isChecked={agreed}
        onChange={onChange}
      />
    </FormGroup>
  );
}

export { DefaultTermsOfService };
