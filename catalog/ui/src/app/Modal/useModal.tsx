import { useRef } from 'react';

export default function useModal(): [
  modalInstance: React.Ref<{
    open: () => void;
    close: () => void;
  }>,
  openModalFn: () => void,
  closeModalFn: () => void
] {
  const modalInstance = useRef(null);

  const openModalFn = () => {
    modalInstance.current.open();
  };

  const closeModalFn = () => {
    modalInstance.current.close();
  };

  return [modalInstance, openModalFn, closeModalFn];
}
