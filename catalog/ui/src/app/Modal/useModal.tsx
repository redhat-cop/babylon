import type React from 'react';
import { useCallback, useRef } from 'react';

export default function useModal(): [
  modalInstance: React.Ref<{
    open: () => void;
    close: () => void;
  }>,
  openModalFn: () => void,
  closeModalFn: () => void,
] {
  const modalInstanceRef = useRef(null);

  const openModalFn = useCallback(() => {
    modalInstanceRef.current?.open();
  }, []);

  const closeModalFn = useCallback(() => {
    modalInstanceRef.current?.close();
  }, []);

  return [modalInstanceRef, openModalFn, closeModalFn];
}
