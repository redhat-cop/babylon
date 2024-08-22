import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Modal, { useModal } from '@app/Modal/Modal';
import useSWRImmutable from 'swr/immutable';
import { apiPaths, fetcher } from '@app/api';
import {
  Button,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  FormGroup,
  InputGroup,
  InputGroupItem,
  MenuSearch,
  MenuSearchInput,
  MenuToggle,
  ModalVariant,
  Radio,
  SearchInput,
} from '@patternfly/react-core';
import LoadingIcon from './LoadingIcon';
import { Table, TableText, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { Opportunity, SalesforceAccount, SfdcType } from '@app/types';
import useDebounce from '@app/utils/useDebounce';

async function fetchAccounts(accountValue: string, sfdcType: SfdcType): Promise<SalesforceAccount[]> {
  if (!sfdcType) return [];
  const acc = await fetcher(apiPaths.SFDC_ACCOUNTS({ sales_type: sfdcType, account_value: accountValue }));
  return acc.items;
}

const OpportunityListByAccount: React.FC<{ accountId: string; onSelectFn: (oppId: string) => void }> = ({
  accountId,
  onSelectFn,
}) => {
  const { data: sfdcList } = useSWRImmutable<{ items: Opportunity[] }>(
    apiPaths.SFDC_BY_ACCOUNT({ account_id: accountId, sales_type: 'opportunity' }),
    fetcher,
  );

  return (
    <div style={{ margin: '24px 0', overflow: 'scroll', maxHeight: '300px' }}>
      <Table aria-label="Opportunity IDs" variant="compact" isStickyHeader>
        <Thead>
          <Tr>
            <Th>Opportunity Name</Th>
            <Th>ID</Th>
            <Th>Close date</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {sfdcList.items.map((x) => (
            <Tr
              key={x.id}
              style={{ opacity: !x.is_valid ? 0.5 : 1 }}
              isClickable={x.is_valid}
              onRowClick={() => x.is_valid ? onSelectFn(x.id) : null}
            >
              <Td dataLabel="name" modifier="breakWord">
                {x.name}
              </Td>
              <Td dataLabel="opportunitynumber__c" modifier="nowrap">
                {x.id}
              </Td>
              <Td dataLabel="closedate" modifier="nowrap">
                {x.close_date}
              </Td>
              <Td dataLabel="action" modifier="fitContent">
                {x.is_valid ? (
                  <TableText>
                    <Button onClick={() => onSelectFn(x.id)}>Select</Button>
                  </TableText>
                ) : (
                  <TableText>
                    <Button isDisabled onClick={null}>
                      Not valid
                    </Button>
                  </TableText>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
};
const SearchSalesforceId: React.FC<{
  sfdcType: SfdcType;
  onSelectFn: (oppId: string) => void;
  selectedAccount: SalesforceAccount;
  setSelectedAccount: React.Dispatch<React.SetStateAction<SalesforceAccount>>;
}> = ({ sfdcType, onSelectFn, selectedAccount, setSelectedAccount }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const debouncedFetchAccounts = useDebounce(fetchAccounts, 500);
  const [accountValue, setAccountValue] = useState('');
  const [accountsSelectIsOpen, setAccountsSelectIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filteredItems, setFilteredItems] = React.useState<SalesforceAccount[]>([]);
  const onSelect = (ev: React.MouseEvent<Element, MouseEvent> | undefined, itemId: string | number | undefined) => {
    if (typeof itemId === 'number' || typeof itemId === 'undefined') {
      return;
    }
    const account = filteredItems.find((u) => u.id === itemId);
    if (account) {
      setSelectedAccount(account);
      setAccountsSelectIsOpen(!accountsSelectIsOpen);
    }
  };

  async function onSearchButtonClick(value: string, sfdcType: SfdcType) {
    setIsLoading(true);
    const accounts = (await debouncedFetchAccounts(value, sfdcType)) as SalesforceAccount[];
    setFilteredItems(accounts);
    setIsLoading(false);
  }

  const onEnterPressed = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      onSearchButtonClick(accountValue, sfdcType);
    }
  };
  useEffect(() => {
    onSearchButtonClick(accountValue, sfdcType);
  }, [accountValue, sfdcType]);
  useEffect(() => {
    setAccountValue('');
    setFilteredItems([]);
  }, [sfdcType]);

  if (!Array.isArray(filteredItems)) {
    return null;
  }
  return (
    <div>
      <Dropdown
        isOpen={accountsSelectIsOpen}
        onOpenChangeKeys={['Escape']}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            onClick={() => setAccountsSelectIsOpen(!accountsSelectIsOpen)}
            isExpanded={accountsSelectIsOpen}
          >
            {selectedAccount?.name || 'Select Account'}
          </MenuToggle>
        )}
        ref={ref}
        id="account-selector"
        onSelect={onSelect}
        isScrollable
      >
        <MenuSearch>
          <MenuSearchInput>
            <InputGroup>
              <InputGroupItem isFill>
                <SearchInput
                  value={accountValue}
                  placeholder={selectedAccount?.name || 'Search'}
                  onChange={(_event, value) => setAccountValue(value)}
                  onKeyPress={onEnterPressed}
                  aria-labelledby="pf-v5-context-selector-search-button-id-1"
                />
              </InputGroupItem>
            </InputGroup>
          </MenuSearchInput>
        </MenuSearch>
        <Divider />
        <DropdownList>
          {isLoading ? (
            <DropdownItem itemId="loading" key="loading">
              <LoadingIcon />
            </DropdownItem>
          ) : null}
          {filteredItems.map((u, index: number) => {
            return (
              <DropdownItem itemId={u.id} key={index} isDisabled={!u.is_valid}>
                {u.name}
                <span style={{ opacity: 0.7, fontSize: '10px', paddingLeft: '12px' }}>id: {u.id}</span>
              </DropdownItem>
            );
          })}
        </DropdownList>
      </Dropdown>
      {sfdcType === 'opportunity' ? (
        <Suspense fallback={<LoadingIcon />}>
          {selectedAccount?.id ? (
            <OpportunityListByAccount accountId={selectedAccount.id} onSelectFn={onSelectFn} />
          ) : null}
        </Suspense>
      ) : null}
    </div>
  );
};
const SearchSalesforceIdModal: React.FC<{
  onSubmitCb: (value: string, type: SfdcType) => void;
  isOpen: boolean;
  onClose: () => void;
  defaultSfdcType?: SfdcType;
}> = ({ onSubmitCb, isOpen, onClose, defaultSfdcType = null }) => {
  const [modal, openModal, closeModal] = useModal();
  const [sfdcType, setSfdcType] = useState(defaultSfdcType);
  const [selectedAccount, setSelectedAccount] = useState<SalesforceAccount>(null);
  useEffect(() => {
    if (!!isOpen) {
      openModal();
    }
  }, [isOpen]);
  useEffect(() => {
    setSfdcType(defaultSfdcType);
  }, [defaultSfdcType]);
  useEffect(() => {
    setSelectedAccount(null);
  }, [sfdcType]);
  const onSelectFn = (id: string) => {
    onSubmitCb(id, sfdcType);
    closeModal();
  };

  return (
    <Modal
      ref={modal}
      onConfirm={() => onSubmitCb(selectedAccount.id, sfdcType)}
      isDisabled={!selectedAccount || sfdcType === 'opportunity'}
      onClose={onClose}
      variant={ModalVariant.large}
    >
      <div style={{ minHeight: '460px' }}>
        <FormGroup
          fieldId="salesforce_id-search-type"
          isRequired={true}
          label={
            <b style={{ paddingBottom: '8px', display: 'inline-block' }}>
              Salesforce ID{' '}
              <span
                style={{
                  fontSize: 'var(--pf-v5-global--FontSize--xs)',
                  color: 'var(--pf-v5-global--palette--black-600)',
                  fontStyle: 'italic',
                  fontWeight: 400,
                }}
              >
                (Opportunity ID, Campaign ID, CDH Party or Project ID)
              </span>
            </b>
          }
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 'var(--pf-v5-global--spacer--md)',
              alignItems: 'center',
              paddingBottom: '16px',
            }}
          >
            <Radio
              isChecked={'campaign' === sfdcType}
              name="sfdc-type"
              onChange={() => setSfdcType('campaign')}
              label="Campaign"
              id="sfdc-type-campaign-comp"
            ></Radio>
            <Radio
              isChecked={'cdh' === sfdcType}
              name="sfdc-type"
              onChange={() => setSfdcType('cdh')}
              label="CDH"
              id="sfdc-type-cdh-comp"
            ></Radio>
            <Radio
              isChecked={'opportunity' === sfdcType}
              name="sfdc-type"
              onChange={() => setSfdcType('opportunity')}
              label="Opportunity"
              id="sfdc-type-opportunity-comp"
            ></Radio>
            <Radio
              isChecked={'project' === sfdcType}
              name="sfdc-type"
              onChange={() => setSfdcType('project')}
              label="Project"
              id="sfdc-type-project-comp"
            ></Radio>
          </div>
        </FormGroup>
        <FormGroup
          fieldId="salesforce_id-search-account"
          isRequired={true}
          style={{ paddingBottom: '16px' }}
          label={<b style={{ paddingBottom: '8px', display: 'inline-block' }}>Account</b>}
        >
          <Suspense fallback={<LoadingIcon />}>
            <SearchSalesforceId
              sfdcType={sfdcType}
              onSelectFn={onSelectFn}
              selectedAccount={selectedAccount}
              setSelectedAccount={setSelectedAccount}
            />
          </Suspense>
        </FormGroup>
      </div>
    </Modal>
  );
};

export default SearchSalesforceIdModal;
