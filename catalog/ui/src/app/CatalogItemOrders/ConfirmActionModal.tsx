import React, { useRef, useState } from 'react';
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextArea,
} from '@patternfly/react-core';

export const MAX_COMMENT_LENGTH = 2048;

type Props = {
  isOpen: boolean;
  title: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  withComment?: boolean;
  children?: React.ReactNode;
  onConfirm: (comment: string) => Promise<void>;
  onClose: () => void;
};

// Mounted only while the modal is open, so the comment starts empty every time.
const ConfirmActionContent: React.FC<Omit<Props, 'isOpen'>> = ({
  title,
  confirmLabel,
  confirmVariant = 'primary',
  withComment = false,
  children,
  onConfirm,
  onClose,
}) => {
  const [comment, setComment] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const inFlight = useRef(false);
  const tooLong = comment.length > MAX_COMMENT_LENGTH;

  async function confirm() {
    if (inFlight.current || tooLong) return;
    inFlight.current = true;
    setIsBusy(true);
    try {
      await onConfirm(comment);
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  }

  return (
    <>
      <ModalHeader title={title} />
      <ModalBody>
        {children}
        {withComment ? (
          <Form onSubmit={(event) => event.preventDefault()} style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
            <FormGroup label="Comment (optional)" fieldId="order-action-comment">
              <TextArea
                id="order-action-comment"
                value={comment}
                onChange={(_event, value) => setComment(value)}
                resizeOrientation="vertical"
                validated={tooLong ? 'error' : 'default'}
                aria-describedby="order-action-comment-helper"
              />
              <FormHelperText>
                <HelperText id="order-action-comment-helper">
                  <HelperTextItem variant={tooLong ? 'error' : 'default'}>
                    {tooLong
                      ? `Comments can be at most ${MAX_COMMENT_LENGTH} characters.`
                      : 'The requester sees this comment.'}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </Form>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant={confirmVariant} onClick={confirm} isLoading={isBusy} isDisabled={isBusy || tooLong}>
          {confirmLabel}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isBusy}>
          Cancel
        </Button>
      </ModalFooter>
    </>
  );
};

/**
 * Explicit confirmation for an order action. The action runs once per confirm;
 * the button stays disabled while it is in flight so double clicks cannot send
 * a second request.
 */
const ConfirmActionModal: React.FC<Props> = ({ isOpen, onClose, title, ...rest }) => (
  <Modal variant="small" isOpen={isOpen} onClose={onClose} aria-label={title}>
    {isOpen ? <ConfirmActionContent title={title} onClose={onClose} {...rest} /> : null}
  </Modal>
);

export default ConfirmActionModal;
