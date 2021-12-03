import React from "react";
import { FunctionComponent, useEffect, useState } from "react"
import {
  Button,
  Form,
  FormGroup,
  Modal,
  ModalVariant,
  TextInput,
} from '@patternfly/react-core';
import {
  ResourceClaim,
  ResourceHandle,
} from '@app/api';

export interface CreateResourcePoolFromResourceHandleModalProps {
  isOpen: any;
  onClose: any;
  resourceClaim?: ResourceClaim;
  resourceHandle: ResourceHandle;
}

const CreateResourcePoolFromResourceHandleModal: React.FunctionComponent<CreateResourcePoolFromResourceHandleModalProps> = ({
  isOpen,
  onClose,
  resourceClaim,
  resourceHandle,
}) => {
  const [resourcePoolName, setResourcePoolName] = useState('');

  useEffect(() => {
    if (resourceClaim) {
      if (resourceClaim.metadata.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl']
        && resourceClaim.metadata.name.match(/-[0-9a-f]{4}$/)
      ) {
        setResourcePoolName(resourceClaim.metadata.name.substring(0, resourceClaim.metadata.name.length - 5));
      } else {
        const nameMatch = resourceClaim.metadata.name.match(/^(.*?)(?:-[0-9]+)?$/);
        setResourcePoolName(nameMatch[1]);
      }
    } else {
      setResourcePoolName(resourceHandle.spec.resources[0].provider.name);
    }
  }, [resourceHandle.metadata.uid, resourceClaim?.metadata.uid]);
  
  return (
    <Modal
      variant={ModalVariant.medium}
      title="Create ResourcePool from ResourceHandle"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="confirm" variant="primary"
          onClick={() => console.log("confirmed")}
        >Confirm</Button>,
        <Button key="cancel" variant="link"
          onClick={onClose}
        >Cancel</Button>
      ]}
    >
      <Form isHorizontal>
        <FormGroup
          label="ResourcePool Name"
          isRequired={true}
          fieldId="resourcePoolName"
        >
          <TextInput
            isRequired={true}
            id="resourcePoolName"
            name="resourcePoolName"
            value={resourcePoolName}
            onChange={(value) => setResourcePoolName(value)}
          />
        </FormGroup>
      </Form>
    </Modal>
  );
}

export default CreateResourcePoolFromResourceHandleModal;
