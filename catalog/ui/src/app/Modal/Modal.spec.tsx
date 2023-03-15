import React from 'react';
import { render, renderHook } from '@testing-library/react';
import Modal, { useModal } from './Modal';

describe('Modal tests', () => {
  it('should render inside #modal-root', () => {
    const { result } = renderHook(() => useModal());
    const [modalRef] = result.current;
    const { container } = render(
      <div>
        <Modal title="My title" onConfirm={() => null} ref={modalRef}>
          <p>My Content</p>
        </Modal>
        <div id="modal-root" />
      </div>
    );
    expect(container.querySelector('#modal-root')).toBeInTheDocument();
    expect(container.innerText).toBeFalsy();
  });
});
