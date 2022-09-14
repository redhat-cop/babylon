import React, {
  useEffect,
  useImperativeHandle,
  useState,
  forwardRef,
  useCallback,
  ForwardRefRenderFunction,
  ReactPortal,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Modal, ModalVariant, Spinner } from '@patternfly/react-core';
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
    type?: 'action' | 'ack';
    confirmText?: string;
  }
> = (
  {
    children,
    onConfirm,
    title = '',
    defaultOpened = false,
    isDisabled = false,
    passModifiers = false,
    type = 'action',
    confirmText = 'Confirm',
  },
  ref
): ReactPortal => {
  const [isOpen, setIsOpen] = useState(defaultOpened);
  const [state, setState] = useState(null);
  const [onConfirmCb, setOnConfirmCb] = useState<() => Promise<void>>(null);
  const close = useCallback(() => {
    setIsLoading(false);
    setIsOpen(false);
  }, []);
  const [_title, setTitle] = useState(title);
  const [_isDisabled, setIsDisabled] = useState(isDisabled);
  const [domReady, setDomReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setDomReady(true);
  }, []);

  useLayoutEffect(() => {
    setTitle(title);
  }, [title]);

  useLayoutEffect(() => {
    setIsDisabled(isDisabled);
  }, [isDisabled]);

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

  const handleOnConfirm = useCallback(async () => {
    setIsLoading(true);
    try {
      onConfirmCb && (await onConfirmCb());
      await onConfirm(state);
      close();
    } catch {
      setIsLoading(false);
    }
  }, [close, onConfirm, onConfirmCb, state]);

  const childrenWithProps = React.Children.map(children, (child) => {
    if (passModifiers && React.isValidElement(child)) {
      return React.cloneElement(
        child as React.ReactElement<{
          setTitle: React.Dispatch<React.SetStateAction<string>>;
          setState: React.Dispatch<unknown>;
          setOnConfirmCb: React.Dispatch<React.SetStateAction<() => Promise<void>>>;
          setIsDisabled: React.Dispatch<React.SetStateAction<boolean>>;
        }>,
        {
          setTitle,
          setState,
          setOnConfirmCb,
          setIsDisabled,
        }
      );
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
            onClose={close}
            aria-label={`Modal: ${_title}`}
            isOpen={isOpen}
            actions={
              type === 'action'
                ? [
                    <Button
                      key="confirm"
                      variant="primary"
                      onClick={handleOnConfirm}
                      isDisabled={_isDisabled || isLoading}
                      icon={isLoading ? <Spinner isSVG size="sm" /> : null}
                    >
                      {confirmText}
                    </Button>,
                    <Button key="cancel" variant="link" onClick={close}>
                      Cancel
                    </Button>,
                  ]
                : [
                    <Button
                      key="confirm"
                      variant="primary"
                      onClick={handleOnConfirm}
                      isDisabled={isDisabled || isLoading}
                    >
                      Close
                    </Button>,
                  ]
            }
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
