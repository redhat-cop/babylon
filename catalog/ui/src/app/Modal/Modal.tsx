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
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Spinner } from '@patternfly/react-core';
import { Modal, ModalVariant } from '@patternfly/react-core/deprecated';
import LoadingSection from '@app/components/LoadingSection';
import useModal from './useModal';

import './modal.css';

const optionalFlags = process.env.OPTIONAL_FLAGS ? process.env.OPTIONAL_FLAGS.split(' ') : [];

const ModalComponent: ForwardRefRenderFunction<
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
    variant?: ModalVariant;
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
    variant = ModalVariant.small,
    className,
  },
  ref,
): ReactPortal => {
  const [isOpen, setIsOpen] = useState(defaultOpened);
  const [state, setState] = useState(null);
  const [onConfirmCb, setOnConfirmCb] = useState<() => Promise<void>>(null);
  const close = useCallback(() => {
    setIsLoading(false);
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
  }, [onClose]);
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

  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.classList.contains('pf-v6-c-backdrop') || target.parentElement?.classList.contains('pf-v6-c-backdrop'))) {
        close();
      }
    },
    [close],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape, false);
      // Add backdrop click handler
      setTimeout(() => {
        document.addEventListener('click', handleBackdropClick, true);
      }, 100);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape, false);
      document.removeEventListener('click', handleBackdropClick, true);
    };
  }, [handleEscape, handleBackdropClick, isOpen]);

  const handleOnConfirm = useCallback(async () => {
    if (type === 'ack') {
      close();
      return null;
    }
    setIsLoading(true);
    try {
      if (onConfirmCb) {
        await onConfirmCb();
      }
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
          close: () => void;
        }>,
        {
          setTitle,
          setState,
          setOnConfirmCb,
          setIsDisabled,
          close,
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
              <Modal isOpen variant={variant} onClose={close} aria-label="Modal: Loading">
                <LoadingSection />
              </Modal>
            }
          >
            <Modal
              className={`modal-component${className ? ` ${className}` : ''} ${optionalFlags
                .map((flag) => `optional-flags__${flag}`)
                .join(' ')}`}
              variant={variant}
              title={_title}
              onClose={close}
              aria-label={`Modal: ${_title}`}
              isOpen={isOpen}
              disableFocusTrap={false}
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
export default forwardRef(ModalComponent);
