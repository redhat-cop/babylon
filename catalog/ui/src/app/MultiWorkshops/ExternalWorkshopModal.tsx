import React, { useState, forwardRef } from 'react';
import {
  FormGroup,
  TextInput,
  TextArea,
} from '@patternfly/react-core';
import { ModalVariant } from '@patternfly/react-core/deprecated';
import Modal from '@app/Modal/Modal';

interface ExternalWorkshopFormData {
  url: string;
  displayName: string;
  description: string;
}

interface ExternalWorkshopModalProps {
  onConfirm: (data: ExternalWorkshopFormData) => void;
}

const ExternalWorkshopModal = forwardRef<{ open: () => void; close: () => void }, ExternalWorkshopModalProps>(
  ({ onConfirm }, ref) => {
    const [formData, setFormData] = useState<ExternalWorkshopFormData>({
      url: '',
      displayName: '',
      description: '',
    });

    const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

    const validateForm = (): boolean => {
      const errors: { [key: string]: string } = {};

      // Validate URL
      if (!formData.url.trim()) {
        errors.url = 'URL is required';
      } else {
        try {
          new URL(formData.url);
        } catch {
          errors.url = 'Please enter a valid URL';
        }
      }

      // Validate display name
      if (!formData.displayName.trim()) {
        errors.displayName = 'Workshop display name is required';
      }

      // Description is optional - no validation needed

      setValidationErrors(errors);
      return Object.keys(errors).length === 0;
    };

    const handleConfirm = () => {
      if (validateForm()) {
        onConfirm(formData);
        // Reset form after successful submission
        setFormData({
          url: '',
          displayName: '',
          description: '',
        });
        setValidationErrors({});
      }
    };

    const handleClose = () => {
      // Reset form on close
      setFormData({
        url: '',
        displayName: '',
        description: '',
      });
      setValidationErrors({});
    };

    return (
      <Modal
        onConfirm={handleConfirm}
        onClose={handleClose}
        title="Add External Workshop"
        confirmText="Add Workshop"
        isDisabled={!formData.url.trim() || !formData.displayName.trim()}
        variant={ModalVariant.medium}
        ref={ref}
      >
      <div>
        <p style={{ marginBottom: '24px', color: 'var(--pf-t--color--text--secondary)' }}>
          Add an external workshop by providing a URL and details. This workshop will be accessible through the event landing page.
        </p>

        <FormGroup
          label="Workshop URL"
          fieldId="external-workshop-url"
          isRequired
          style={{ marginBottom: '24px' }}
        >
          <TextInput
            id="external-workshop-url"
            type="url"
            value={formData.url}
            onChange={(_event, value) => {
              setFormData(prev => ({ ...prev, url: value }));
              if (validationErrors.url) {
                setValidationErrors(prev => ({ ...prev, url: '' }));
              }
            }}
            placeholder="https://example.com/workshop"
            validated={validationErrors.url ? 'error' : 'default'}
          />
        </FormGroup>

        <FormGroup
          label="Workshop Display Name"
          fieldId="external-workshop-display-name"
          isRequired
          style={{ marginBottom: '24px' }}
        >
          <TextInput
            id="external-workshop-display-name"
            value={formData.displayName}
            onChange={(_event, value) => {
              setFormData(prev => ({ ...prev, displayName: value }));
              if (validationErrors.displayName) {
                setValidationErrors(prev => ({ ...prev, displayName: '' }));
              }
            }}
            placeholder="Enter workshop display name"
            validated={validationErrors.displayName ? 'error' : 'default'}
          />
        </FormGroup>

        <FormGroup
          label="Workshop Description"
          fieldId="external-workshop-description"
          style={{ marginBottom: '0' }}
        >
          <TextArea
            id="external-workshop-description"
            value={formData.description}
            onChange={(_event, value) => {
              setFormData(prev => ({ ...prev, description: value }));
              if (validationErrors.description) {
                setValidationErrors(prev => ({ ...prev, description: '' }));
              }
            }}
            placeholder="Enter workshop description (optional)"
            validated={validationErrors.description ? 'error' : 'default'}
            rows={3}
          />
        </FormGroup>
      </div>
    </Modal>
  );
});

export default ExternalWorkshopModal;
