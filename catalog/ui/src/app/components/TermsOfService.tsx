import * as React from 'react';

import {
  Checkbox,
  FormGroup,
} from '@patternfly/react-core';

import {
  renderContent,
} from '@app/util';

export interface TermsOfServiceProps {
  agreed: boolean;
  onChange?: any;
  text?: string;
}

const TermsOfService: React.FunctionComponent<TermsOfServiceProps> = ({
  agreed,
  onChange,
  text,
}) => {
  return (
    <FormGroup label="IMPORTANT PLEASE READ" className="rhpds-catalog__terms-of-service">
      { text ? (
        <div dangerouslySetInnerHTML={{ __html: renderContent(text) }}/>
      ) : (
        <div>
          <p>Please pay close attention to the information provided in this page.</p>
          <p>After you order your environment, you can manage it by logging into this system and select Services.</p>
          <p>The ordered environment will cease to run unless you use Extend Runtime in App Control.</p>
          <p>The ordered environment will cease to exist at the Expiration Date time stamp provided unless you use Extend Lifetime in App Control.</p>
          <p>If you have read and understood the above, click the check box below then Submit to continue.</p>
        </div>
      )}
      <Checkbox
        label="I confirm that I understand the above warnings."
        id="terms-of-service"
        isChecked={agreed}
        onChange={onChange}
      />
    </FormGroup>
  );
}

export { TermsOfService };
