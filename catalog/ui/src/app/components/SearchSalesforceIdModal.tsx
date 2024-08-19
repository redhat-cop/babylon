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
import { Opportunity } from '@app/types';
import useDebounce from '@app/utils/useDebounce';

async function fetchAccounts(accountValue: string): Promise<{ id: string; name: string }[]> {
  const acc = await fetcher(apiPaths.SFDC_ACCOUNTS({ sales_type: 'opportunity', account_value: accountValue }));
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
            <Th>Amount</Th>
            <Th>Owner</Th>
            <Th>Close date</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {sfdcList.items.map((x) => (
            <Tr key={x.id} style={{ opacity: x.isclosed ? 0.5 : 1 }} isClickable onRowClick={() => onSelectFn(x.opportunitynumber__c)}>
              <Td dataLabel="name" modifier="breakWord">{x.name}</Td>
              <Td dataLabel="opportunitynumber__c" modifier="nowrap">{x.opportunitynumber__c}</Td>
              <Td dataLabel="amount" modifier="nowrap">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: x.currencyisocode,
                }).format(x.amount)}
              </Td>
              <Td dataLabel="owner" modifier="wrap">{x.owner.email}</Td>
              <Td dataLabel="closedate" modifier="nowrap">{x.closedate}</Td>
              <Td dataLabel="action" modifier="fitContent">
                {x.isclosed ? null : <TableText><Button onClick={() => onSelectFn(x.opportunitynumber__c)}>Select</Button></TableText>}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
};
const SearchSalesforceIdOpportunity: React.FC<{ onSelectFn: (oppId: string) => void }> = ({ onSelectFn }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const debouncedFetchAccounts = useDebounce(fetchAccounts, 500);
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string }>(null);
  const [accountValue, setAccountValue] = useState('');
  const [accountsSelectIsOpen, setAccountsSelectIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filteredItems, setFilteredItems] = React.useState<{ id: string; name: string }[]>([]);
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

  const onSearchButtonClick = useCallback(
    async (value: string) => {
      setIsLoading(true);
      const accounts = (await debouncedFetchAccounts(value)) as { id: string; name: string }[];
      setFilteredItems(accounts);
      setIsLoading(false);
    },
    [setIsLoading, setFilteredItems, debouncedFetchAccounts],
  );

  const onEnterPressed = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      onSearchButtonClick(accountValue);
    }
  };
  useEffect(() => {
    onSearchButtonClick(accountValue);
  }, [accountValue]);

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
              <DropdownItem itemId={u.id} key={index}>
                {u.name}
                <span style={{ opacity: 0.7, fontSize: '10px', paddingLeft: '12px' }}>id: {u.id}</span>
              </DropdownItem>
            );
          })}
        </DropdownList>
      </Dropdown>
      <Suspense fallback={<LoadingIcon />}>
        {selectedAccount?.id ? (
          <OpportunityListByAccount accountId={selectedAccount.id} onSelectFn={onSelectFn} />
        ) : null}
      </Suspense>
    </div>
  );
};
const SearchSalesforceIdModal: React.FC<{
  onSubmitCb: (value: string, type: 'campaign' | 'cdh' | 'project' | 'opportunity') => void;
  isOpen: boolean;
  onClose: () => void;
  defaultSfdcType?: 'campaign' | 'cdh' | 'project' | 'opportunity';
}> = ({ onSubmitCb, isOpen, onClose, defaultSfdcType = null }) => {
  const [modal, openModal, closeModal] = useModal();
  const [sfdcType, setSfdcType] = useState(defaultSfdcType);
  useEffect(() => {
    if (!!isOpen) {
      openModal();
    }
  }, [isOpen]);
  useEffect(() => {
    setSfdcType(defaultSfdcType);
  }, [defaultSfdcType]);
  const onSelectFn = (oppId: string) => {
    onSubmitCb(oppId, sfdcType);
    closeModal();
  };

  return (
    <Modal ref={modal} type="ack" onConfirm={null} onClose={onClose} variant={ModalVariant.large}>
      <div style={{minHeight: '460px'}}>
        <FormGroup
          fieldId="salesforce_id-search-type"
          isRequired={true}
          label={
            <b style={{ paddingBottom: '8px',     display: 'inline-block' }}>
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
        {sfdcType === 'opportunity' ? (
          <FormGroup
            fieldId="salesforce_id-search-account"
            isRequired={true}
            style={{ paddingBottom: '16px' }}
            label={<b style={{ paddingBottom: '8px',display: 'inline-block' }}>Account</b>}
          >
            <Suspense fallback={<LoadingIcon />}>
              <SearchSalesforceIdOpportunity onSelectFn={onSelectFn} />
            </Suspense>
          </FormGroup>
        ) : sfdcType !== null ? (
          <p>Salesforce ID type not available.</p>
        ) : null}
      </div>
    </Modal>
  );
};

export default SearchSalesforceIdModal;
