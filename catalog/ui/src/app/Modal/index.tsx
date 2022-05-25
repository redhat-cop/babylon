import React, {
  useEffect,
  useImperativeHandle,
  useState,
  forwardRef,
  useCallback,
  ForwardRefRenderFunction,
  ReactPortal,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Modal, ModalVariant } from '@patternfly/react-core';
import './modal.css';

type Ref = {
  open: () => void;
  onClose: () => void;
} | null;

const modalElement = document.getElementById('modal-root');

const _Modal: ForwardRefRenderFunction<
  Ref,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onConfirm: (_: any) => Promise<void>;
    defaultOpened?: boolean;
    title?: string;
    children: React.ReactNode;
  }
> = ({ children, onConfirm, title = '', defaultOpened = false }, ref): ReactPortal => {
  const [isOpen, setIsOpen] = useState(defaultOpened);
  const [state, setState] = useState(null);
  const [onConfirmCb, setOnConfirmCb] = useState(() => null);
  const onClose = useCallback(() => setIsOpen(false), []);
  const [_title, setTitle] = useState(title);

  useImperativeHandle(
    ref,
    () => ({
      open: () => setIsOpen(true),
      onClose,
    }),
    [onClose]
  );

  const handleEscape = useCallback(
    (e) => {
      if (e.keyCode === 27) onClose();
    },
    [onClose]
  );

  const handleClick = useCallback(
    (e) => {
      const backdrop = document.querySelector('.pf-c-backdrop');
      const modal = document.querySelector('.pf-c-modal-box');
      if (!modal || !backdrop) {
        return e;
      }
      if (e.target === backdrop || backdrop.contains(e.target)) {
        if (e.target !== modal && !modal.contains(e.target)) {
          onClose();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape, false);
      document.addEventListener('click', handleClick, false);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape, false);
      document.removeEventListener('click', handleEscape, false);
    };
  }, [handleEscape, isOpen, handleClick]);

  const childrenWithProps = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { setTitle, setState, setOnConfirmCb });
    }
    return child;
  });

  return createPortal(
    isOpen ? (
      <Modal
        className="modal-component"
        variant={ModalVariant.small}
        title={_title}
        aria-label={`Modal: ${_title}`}
        isOpen={isOpen}
        onClose={onClose}
        actions={[
          <Button
            key="confirm"
            variant="primary"
            onClick={() => {
              onConfirm(state);
              onConfirmCb && onConfirmCb();
              onClose();
            }}
          >
            Confirm
          </Button>,
          <Button key="cancel" variant="link" onClick={onClose}>
            Cancel
          </Button>,
        ]}
      >
        {childrenWithProps}
      </Modal>
    ) : null,
    modalElement
  );
};

export default forwardRef(_Modal);
