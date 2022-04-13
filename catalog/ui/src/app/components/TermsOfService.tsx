import * as React from 'react';

import { Checkbox, FormGroup } from '@patternfly/react-core';

import { renderContent } from '@app/util';

export interface TermsOfServiceProps {
  agreed: boolean;
  onChange: (checked: boolean, event: React.FormEvent<HTMLInputElement>) => void;
  text?: string;
}

const TermsOfService: React.FunctionComponent<TermsOfServiceProps> = ({ agreed, onChange, text }) => {
  return (
    <FormGroup fieldId="" label="IMPORTANT PLEASE READ" className="catalog-terms-of-service">
      <div dangerouslySetInnerHTML={{ __html: renderContent(text, { format: 'html' }) }} />
      <Checkbox
        label="I confirm that I understand the above warnings."
        id="terms-of-service"
        isChecked={agreed}
        onChange={onChange}
      />
    </FormGroup>
  );
};

export default TermsOfService;
