import React, { useEffect, useState } from 'react';

import { Button, Form, FormGroup, HelperText, Modal, ModalVariant, TextArea } from '@patternfly/react-core';

import './bulk-user-assignment-modal.css';

export interface BulkUserAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (emails: string[]) => void;
}

const BulkUserAssignmentModal: React.FunctionComponent<BulkUserAssignmentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [emailsText, setEmailsText] = useState<string>('');

  function onConfirmClicked(): void {
    const emails: string[] = emailsText.split(/[\s,]+/);
    onConfirm(emails);
  }

  // Reset emails text each time modal is opened.
  useEffect(() => {
    setEmailsText('');
  }, [isOpen]);

  return (
    <Modal
      className="bulk-user-assignment-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk User Assignment"
      variant={ModalVariant.medium}
      actions={[
        <Button key="confirm" variant="primary" onClick={onConfirmClicked}>
          Confirm
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      <Form>
        <FormGroup fieldId="emails" label="User Emails">
          <HelperText>Enter workshop user email addresses separated by commas, whitespace, or blank lines.</HelperText>
          <TextArea autoFocus id="emails" onChange={(_event, v) => setEmailsText(v)} type="text" value={emailsText} />
        </FormGroup>
      </Form>
    </Modal>
  );
};

export default BulkUserAssignmentModal;
