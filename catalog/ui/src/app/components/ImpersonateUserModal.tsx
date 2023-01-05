import React, { useEffect, useState } from 'react';
import { listUsers } from '@app/api';
import { useNavigate } from 'react-router-dom';
import { Button, ContextSelector, ContextSelectorItem, Modal, SearchInput } from '@patternfly/react-core';
import { User, UserList } from '@app/types';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useSession from '@app/utils/useSession';

import './impersonate-user-modal.css';

const ImpersonateUserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { setImpersonation } = useImpersonateUser();
  const [users, setUsers] = useState<User[]>([]);
  const [userSelectIsOpen, setUserSelectIsOpen] = useState(false);
  const [userSearchValue, setUserSearchValue] = useState('');
  const [user, setUser] = useState<User>(null);

  const { authUser } = useSession().getSession();

  function onConfirm() {
    setImpersonation(user.metadata.name);
    onClose();
  }

  async function fetchUsers() {
    const resp: UserList = await listUsers({ disableImpersonation: true });
    setUsers(resp.items);
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <Modal
      className="impersonate-user-modal"
      title="Impersonate User"
      isOpen={isOpen}
      onClose={onClose}
      variant="small"
      actions={[
        <Button key="confirm" variant="primary" onClick={() => onConfirm()}>
          Confirm
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      <ContextSelector
        isOpen={userSelectIsOpen}
        onSearchInputChange={(value: string) => setUserSearchValue(value)}
        onToggle={() => setUserSelectIsOpen((v) => !v)}
        searchInputValue={userSearchValue}
        toggleText={user?.metadata?.name || 'Select User'}
      >
        {users
          .filter((user) => user.metadata.name != authUser && user.metadata.name.includes(userSearchValue))
          .map((user) => (
            <ContextSelectorItem
              key={user.metadata.name}
              onClick={() => {
                setUser(user);
                setUserSelectIsOpen(false);
              }}
            >
              {user.metadata.name}
            </ContextSelectorItem>
          ))}
      </ContextSelector>
    </Modal>
  );
};

export default ImpersonateUserModal;
