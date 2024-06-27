import React, { useMemo } from 'react';
import { Checkbox, FormGroup } from '@patternfly/react-core';
import { renderContent } from '@app/util';

const TermsOfService: React.FC<{
  agreed: boolean;
  onChange: (event: React.FormEvent<HTMLInputElement>, checked: boolean) => void;
  text?: string;
}> = ({ agreed, onChange, text }) => {
  const tosHtml = useMemo(
    () => <div dangerouslySetInnerHTML={{ __html: renderContent(text, { format: 'html' }) }} />,
    [text],
  );
  return (
    <FormGroup fieldId="" label="IMPORTANT PLEASE READ" className="terms-of-service">
      {tosHtml}
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
