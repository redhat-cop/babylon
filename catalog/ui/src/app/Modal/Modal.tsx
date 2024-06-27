import React, {
  useEffect,
  useImperativeHandle,
  useState,
  forwardRef,
  useCallback,
  ForwardRefRenderFunction,
  ReactPortal,
  useLayoutEffect,
  Suspense,
  useRef,
} from 'react';
import ReactDOM, { createPortal } from 'react-dom';
import { Button, Modal, ModalVariant, Spinner } from '@patternfly/react-core';
import LoadingSection from '@app/components/LoadingSection';
import useModal from './useModal';

import './modal.css';

const optionalFlags = process.env.OPTIONAL_FLAGS ? process.env.OPTIONAL_FLAGS.split(' ') : [];

const _Modal: ForwardRefRenderFunction<
  {
    open: () => void;
    close: () => void;
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onConfirm: (_: any) => Promise<void> | void;
    onClose?: () => void;
    defaultOpened?: boolean;
    title?: string;
    children: React.ReactNode;
    isDisabled?: boolean;
    passModifiers?: boolean;
    type?: 'action' | 'ack';
    confirmText?: string;
    className?: string;
  }
> = (
  {
    children,
    onConfirm,
    onClose,
    title = '',
    defaultOpened = false,
    isDisabled = false,
    passModifiers = false,
    type = 'action',
    confirmText = 'Confirm',
    className,
  },
  ref,
): ReactPortal => {
  const [isOpen, setIsOpen] = useState(defaultOpened);
  const [state, setState] = useState(null);
  const modalEl = useRef();
  const [onConfirmCb, setOnConfirmCb] = useState<() => Promise<void>>(null);
  const close = useCallback(() => {
    setIsLoading(false);
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
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
    [close],
  );

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    },
    [close],
  );

  const handleClick = useCallback(
    (e: MouseEvent | TouchEvent) => {
      const targetEl = e.target as HTMLElement;
      const container = ReactDOM.findDOMNode(modalEl.current) as Element;
      const backdrop = container;
      const modal = container?.querySelector('.pf-v5-c-modal-box');
      if (!modal || !backdrop) return e;
      if (e.target === backdrop || backdrop.contains(targetEl)) {
        if (e.target !== modal && !modal.contains(targetEl)) {
          close();
          return null;
        }
      }
      return e;
    },
    [close],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape, false);
      document.addEventListener('click', handleClick, false);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape, false);
      document.removeEventListener('click', handleClick, false);
    };
  }, [handleEscape, isOpen, handleClick]);

  const handleOnConfirm = useCallback(async () => {
    if (type === 'ack') {
      close();
      return null;
    }
    setIsLoading(true);
    try {
      onConfirmCb && (await onConfirmCb());
      await onConfirm(state);
      close();
    } catch {
      setIsLoading(false);
    }
  }, [close, onConfirm, onConfirmCb, state, type]);

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
        },
      );
    }
    return child;
  });

  return domReady
    ? createPortal(
        isOpen ? (
          <Suspense
            fallback={
              <Modal ref={modalEl} isOpen variant={ModalVariant.small} onClose={close} aria-label="Modal: Loading">
                <LoadingSection />
              </Modal>
            }
          >
            <Modal
              ref={modalEl}
              className={`modal-component${className ? ` ${className}` : ''} ${optionalFlags
                .map((flag) => `optional-flags__${flag}`)
                .join(' ')}`}
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
                        icon={isLoading ? <Spinner size="sm" /> : null}
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
          </Suspense>
        ) : null,
        document.getElementById('modal-root'),
      )
    : null;
};

export { useModal };
export default forwardRef(_Modal);
