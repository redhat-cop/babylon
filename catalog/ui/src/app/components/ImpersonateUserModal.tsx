import React, { useEffect, useState } from 'react';
import { listUsers } from '@app/api';
import {
  Button,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  InputGroup,
  InputGroupItem,
  MenuSearch,
  MenuSearchInput,
  MenuToggle,
  Modal,
  SearchInput,
} from '@patternfly/react-core';
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
  const [filteredItems, setFilteredItems] = React.useState<User[]>([]);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const { authUser } = useSession().getSession();

  function onConfirm() {
    setImpersonation(user.metadata.name);
    onClose();
  }

  async function fetchUsers() {
    const resp: UserList = await listUsers({ disableImpersonation: true });
    setUsers(resp.items);
    setFilteredItems(resp.items);
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    onSearchButtonClick();
  }, [userSearchValue]);

  const onSearchButtonClick = () => {
    const filtered =
      userSearchValue === ''
        ? users
        : users.filter((u) => {
            const str = u.metadata.name;
            return str.toLowerCase().indexOf(userSearchValue.toLowerCase()) !== -1;
          });

    setFilteredItems(filtered || []);
  };

  const onEnterPressed = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      onSearchButtonClick();
    }
  };

  const onSelect = (ev: React.MouseEvent<Element, MouseEvent> | undefined, itemId: string | number | undefined) => {
    if (typeof itemId === 'number' || typeof itemId === 'undefined') {
      return;
    }
    setUser(users.find((u) => u.metadata.name === itemId));
    setUserSelectIsOpen(!userSelectIsOpen);
  };

  const onToggleClick = () => {
    setUserSelectIsOpen(!userSelectIsOpen);
  };

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
      <Dropdown
        isOpen={userSelectIsOpen}
        onOpenChangeKeys={['Escape']}
        toggle={(toggleRef) => (
          <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={userSelectIsOpen}>
            {user?.metadata?.name || 'Select User'}
          </MenuToggle>
        )}
        ref={menuRef}
        id="context-selector"
        onSelect={onSelect}
        isScrollable
      >
        <MenuSearch>
          <MenuSearchInput>
            <InputGroup>
              <InputGroupItem isFill>
                <SearchInput
                  value={userSearchValue}
                  placeholder={user?.metadata?.name || 'Search'}
                  onChange={(_event, value) => setUserSearchValue(value)}
                  onKeyPress={onEnterPressed}
                  aria-labelledby="pf-v5-context-selector-search-button-id-1"
                />
              </InputGroupItem>
            </InputGroup>
          </MenuSearchInput>
        </MenuSearch>
        <Divider />
        <DropdownList>
          {filteredItems
            .filter((u) => u.metadata.name != authUser)
            .map((u, index) => {
              return (
                <DropdownItem itemId={u.metadata.name} key={index}>
                  {u.metadata.name}
                </DropdownItem>
              );
            })}
        </DropdownList>
      </Dropdown>
    </Modal>
  );
};

export default ImpersonateUserModal;
