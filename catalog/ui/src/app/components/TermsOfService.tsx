import React, { useMemo } from 'react';
import RenderedContent from '@app/components/RenderedContent';
import { Checkbox, FormGroup } from '@patternfly/react-core';

const TermsOfService: React.FC<{
  agreed: boolean;
  onChange: (event: React.FormEvent<HTMLInputElement>, checked: boolean) => void;
  text?: string;
}> = ({ agreed, onChange, text }) => {
  const tosHtml = useMemo(
    () => <RenderedContent content={text} options={{ format: 'html' }} />,
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
