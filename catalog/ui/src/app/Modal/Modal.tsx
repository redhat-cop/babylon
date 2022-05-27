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
import useModal from './useModal';

import './modal.css';

const _Modal: ForwardRefRenderFunction<
  {
    open: () => void;
    close: () => void;
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onConfirm: (_: any) => Promise<void> | void;
    defaultOpened?: boolean;
    title?: string;
    children: React.ReactNode;
    isDisabled?: boolean;
    passModifiers?: boolean;
  }
> = (
  { children, onConfirm, title = '', defaultOpened = false, isDisabled = false, passModifiers = false },
  ref
): ReactPortal => {
  const [isOpen, setIsOpen] = useState(defaultOpened);
  const [state, setState] = useState(null);
  const [onConfirmCb, setOnConfirmCb] = useState(() => null);
  const close = useCallback(() => setIsOpen(false), []);
  const [_title, setTitle] = useState(title);
  const [domReady, setDomReady] = useState(false);

  useEffect(() => {
    setDomReady(true);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      open: () => setIsOpen(true),
      close,
    }),
    [close]
  );

  const handleEscape = useCallback(
    (e) => {
      if (e.keyCode === 27) close();
    },
    [close]
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
          close();
        }
      }
    },
    [close]
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
    if (passModifiers && React.isValidElement(child)) {
      return React.cloneElement(child, { setTitle, setState, setOnConfirmCb });
    }
    return child;
  });

  return domReady
    ? createPortal(
        isOpen ? (
          <Modal
            className="modal-component"
            variant={ModalVariant.small}
            title={_title}
            aria-label={`Modal: ${_title}`}
            isOpen={isOpen}
            actions={[
              <Button
                key="confirm"
                variant="primary"
                onClick={() => {
                  onConfirm(state);
                  onConfirmCb && onConfirmCb();
                  close();
                }}
                isDisabled={isDisabled}
              >
                Confirm
              </Button>,
              <Button key="cancel" variant="link" onClick={close}>
                Cancel
              </Button>,
            ]}
          >
            {childrenWithProps}
          </Modal>
        ) : null,
        document.getElementById('modal-root')
      )
    : null;
};

export { useModal };
export default forwardRef(_Modal);
