import React, { useCallback, useRef } from 'react';

export default function useModal(): [
  modalInstance: React.Ref<{
    open: () => void;
    close: () => void;
  }>,
  openModalFn: () => void,
  closeModalFn: () => void,
] {
  const modalInstance = useRef(null);

  const openModalFn = useCallback(() => {
    modalInstance.current?.open();
  }, []);

  const closeModalFn = useCallback(() => {
    modalInstance.current?.close();
  }, []);

  return [modalInstance, openModalFn, closeModalFn];
}
