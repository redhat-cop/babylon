import React from 'react';
import {
  Button,
  Modal,
  ModalVariant,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';
import SalesforceItemsField from './SalesforceItemsField';
import type { SalesforceItem } from '@app/types';

interface SalesforceItemsEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: SalesforceItem[];
  onSave: (items: SalesforceItem[]) => Promise<void> | void;
}

const SalesforceItemsEditModal: React.FC<SalesforceItemsEditModalProps> = ({
  isOpen,
  onClose,
  items,
  onSave,
}) => {
  const [localItems, setLocalItems] = React.useState<SalesforceItem[]>(items);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setLocalItems(items);
    }
  }, [items, isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localItems);
      onClose();
    } catch (error) {
      console.error('Failed to save Salesforce items:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant={ModalVariant.medium}
    >
      <ModalHeader><b>Salesforce IDs</b></ModalHeader>
      <ModalBody>
        <div style={{ maxWidth: '100%', padding: '16px 0' }}>
          <SalesforceItemsField
            label=""
            helperText="Add one or more Salesforce IDs (Opportunity, Campaign, or Project)."
            items={localItems}
            onChange={setLocalItems}
            hideExistingItems={true}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          isDisabled={isSaving}
        >
          Save
        </Button>
        <Button
          variant="link"
          onClick={onClose}
          isDisabled={isSaving}
        >
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default SalesforceItemsEditModal;

