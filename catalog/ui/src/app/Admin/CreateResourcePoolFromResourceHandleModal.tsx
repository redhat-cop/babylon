import React from 'react';
import { useEffect, useReducer, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  Modal,
  ModalVariant,
  NumberInput,
  Select,
  SelectOption,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import { ResourceClaim, ResourceHandle, ResourcePool } from '@app/types';
import { createResourcePool, getResourcePool } from '@app/api';
import { BABYLON_DOMAIN } from '@app/util';
import yaml from 'js-yaml';

export interface CreateResourcePoolFromResourceHandleModalProps {
  isOpen: any;
  onClose: any;
  resourceClaim?: ResourceClaim;
  resourceHandle: ResourceHandle;
}

const CreateResourcePoolFromResourceHandleModal: React.FunctionComponent<
  CreateResourcePoolFromResourceHandleModalProps
> = ({ isOpen, onClose, resourceClaim, resourceHandle }) => {
  const history = useHistory();
  const [resourcePoolName, setResourcePoolName] = useState<string>(
    resourceClaim
      ? resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/externalPlatformUrl`] &&
        resourceClaim.metadata.name.match(/-[0-9a-f]{4}$/)
        ? resourceClaim.metadata.name.substring(0, resourceClaim.metadata.name.length - 5)
        : resourceClaim.metadata.name.replace(/-[0-9]+$/, '')
      : resourceHandle.spec.resources[0].provider.name
  );
  const [nameConflict, setNameConflict] = useState<boolean | null>(null);
  const [minAvailable, setMinAvailable] = useState<number>(1);
  const [stopAfterProvision, setStopAfterProvision] = useState<boolean>(true);
  const [defaultLifespan, setDefaultLifespan] = useState<string>('7d');
  const [defaultLifespanIsOpen, setDefaultLifespanIsOpen] = useState<boolean>(false);
  const [maximumLifespan, setMaximumLifespan] = useState<string>('14d');
  const [maximumLifespanIsOpen, setMaximumLifespanIsOpen] = useState<boolean>(false);
  const [relativeMaximumLifespan, setRelativeMaximumLifespan] = useState<string>('7d');
  const [relativeMaximumLifespanIsOpen, setRelativeMaximumLifespanIsOpen] = useState<boolean>(false);
  const [unclaimedLifespan, setUnclaimedLifespan] = useState<string>('7d');

  const poolNameValidated: boolean = resourcePoolName.match(/^[a-z0-9A-Z]([a-z0-9A-Z\-._]*[a-z0-9A-Z])?$/) !== null;

  async function checkForNameConflict(checkName: string) {
    try {
      const existingResourcePool = await getResourcePool(checkName);
      if (existingResourcePool) {
        setNameConflict(true);
      }
    } catch (error) {
      if (error instanceof Response && error.status === 404) {
        setNameConflict(false);
      } else {
        throw error;
      }
    }
  }

  async function onConfirm() {
    await createResourcePool({
      apiVersion: 'poolboy.gpte.redhat.com/v1',
      kind: 'ResourcePool',
      metadata: {
        name: resourcePoolName,
        namespace: 'poolboy',
      },
      spec: {
        lifespan: {
          default: defaultLifespan,
          maximum: maximumLifespan,
          relativeMaximum: relativeMaximumLifespan,
          unclaimed: unclaimedLifespan,
        },
        minAvailable: minAvailable,
        resources: [
          ...resourceHandle.spec.resources.map((resource) => {
            return {
              name: resource.name,
              provider: resource.provider,
              template: {
                spec: {
                  vars: {
                    job_vars: resource.template.spec.vars?.job_vars,
                  },
                },
              },
            };
          }),
        ],
      },
    });
    history.push(`/admin/resourcepools/${resourcePoolName}`);
  }

  useEffect(() => {
    checkForNameConflict(resourcePoolName);
    setMinAvailable(1);
    setStopAfterProvision(true);
  }, [resourceHandle.metadata.uid, resourceClaim?.metadata.uid]);

  useEffect(() => {
    checkForNameConflict(resourcePoolName);
  }, [resourcePoolName]);

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Create ResourcePool from ResourceHandle"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="confirm" variant="primary" isDisabled={nameConflict || !poolNameValidated} onClick={onConfirm}>
          Confirm
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      <Form>
        <FormGroup isRequired label="ResourcePool Name" fieldId="resourcePoolName">
          <TextInput
            isRequired
            id="resourcePoolName"
            name="resourcePoolName"
            value={resourcePoolName}
            onChange={(value) => {
              setResourcePoolName(value);
            }}
            validated={!nameConflict && poolNameValidated ? 'success' : 'error'}
          />
        </FormGroup>
        <FormGroup label="Minimum Available" fieldId="minAvailable">
          <NumberInput
            id="minAvailable"
            max={99}
            min={0}
            name="minAvailable"
            value={minAvailable}
            onChange={(event: any) => {
              const n = isNaN(event.target.value) ? 10 : event.target.value;
              setMinAvailable(n < 0 ? 0 : n > 99 ? 99 : n);
            }}
            onMinus={() => setMinAvailable(minAvailable - 1)}
            onPlus={() => setMinAvailable(minAvailable + 1)}
          />
        </FormGroup>
        <FormGroup label="Stop after provision" fieldId="stopAfterProvision">
          <Checkbox
            id="stopAfterProvision"
            label="enabled"
            name="stopAfterProvision"
            isChecked={stopAfterProvision}
            onChange={(checked) => setStopAfterProvision(checked)}
          />
        </FormGroup>
        <FormGroup label="Default Lifespan" fieldId="defaultLifespan">
          <Select
            className="admin-lifespan-select"
            id="defaultLifespan"
            isOpen={defaultLifespanIsOpen}
            onSelect={(event, value) => {
              setDefaultLifespan(value as string);
              setDefaultLifespanIsOpen(false);
            }}
            onToggle={() => setDefaultLifespanIsOpen((v) => !v)}
            selections={defaultLifespan}
          >
            <SelectOption value="2h" />
            <SelectOption value="3h" />
            <SelectOption value="4h" />
            <SelectOption value="6h" />
            <SelectOption value="8h" />
            <SelectOption value="12h" />
            <SelectOption value="18h" />
            <SelectOption value="1d" />
            <SelectOption value="2d" />
            <SelectOption value="3d" />
            <SelectOption value="4d" />
            <SelectOption value="5d" />
            <SelectOption value="6d" />
            <SelectOption value="7d" />
            <SelectOption value="8d" />
            <SelectOption value="9d" />
            <SelectOption value="10d" />
            <SelectOption value="12d" />
            <SelectOption value="14d" />
            <SelectOption value="1000d" />
          </Select>
        </FormGroup>
        <FormGroup label="Maximum Lifespan" fieldId="maximumLifespan">
          <Select
            className="admin-lifespan-select"
            id="maximumLifespan"
            isOpen={maximumLifespanIsOpen}
            onSelect={(event, value) => {
              setMaximumLifespan(value as string);
              setMaximumLifespanIsOpen(false);
            }}
            onToggle={() => setMaximumLifespanIsOpen((v) => !v)}
            selections={maximumLifespan}
          >
            <SelectOption value="2h" />
            <SelectOption value="3h" />
            <SelectOption value="4h" />
            <SelectOption value="6h" />
            <SelectOption value="8h" />
            <SelectOption value="12h" />
            <SelectOption value="18h" />
            <SelectOption value="1d" />
            <SelectOption value="2d" />
            <SelectOption value="3d" />
            <SelectOption value="4d" />
            <SelectOption value="5d" />
            <SelectOption value="6d" />
            <SelectOption value="7d" />
            <SelectOption value="8d" />
            <SelectOption value="9d" />
            <SelectOption value="10d" />
            <SelectOption value="12d" />
            <SelectOption value="14d" />
            <SelectOption value="1000d" />
          </Select>
        </FormGroup>
        <FormGroup label="Relative Maximum Lifespan" fieldId="relativeMaximumLifespan">
          <Select
            className="admin-lifespan-select"
            id="relativeMaximumLifespan"
            isOpen={relativeMaximumLifespanIsOpen}
            onSelect={(event, value) => {
              setRelativeMaximumLifespan(value as string);
              setRelativeMaximumLifespanIsOpen(false);
            }}
            onToggle={() => setRelativeMaximumLifespanIsOpen((v) => !v)}
            selections={relativeMaximumLifespan}
          >
            <SelectOption value="2h" />
            <SelectOption value="3h" />
            <SelectOption value="4h" />
            <SelectOption value="6h" />
            <SelectOption value="8h" />
            <SelectOption value="12h" />
            <SelectOption value="18h" />
            <SelectOption value="1d" />
            <SelectOption value="2d" />
            <SelectOption value="3d" />
            <SelectOption value="4d" />
            <SelectOption value="5d" />
            <SelectOption value="6d" />
            <SelectOption value="7d" />
            <SelectOption value="8d" />
            <SelectOption value="9d" />
            <SelectOption value="10d" />
            <SelectOption value="12d" />
            <SelectOption value="14d" />
            <SelectOption value="1000d" />
          </Select>
        </FormGroup>
        {resourceHandle.spec.resources.map((resourceHandleSpecResource, idx) => {
          const resourceName = resourceHandleSpecResource.name || resourceHandleSpecResource.provider.name;
          const resourceLabel =
            resourceName === 'babylon' ? 'Babylon Legacy CloudForms Integration' : `Resource ${resourceName}`;
          return (
            <FormGroup key={idx} label={`${resourceLabel} job vars`} fieldId={`resource${idx}`}>
              <TextArea
                className="admin-yaml-display"
                id={`resource${idx}`}
                name={`resource${idx}`}
                value={yaml.dump(resourceHandleSpecResource.template?.spec?.vars?.job_vars || {})}
              />
            </FormGroup>
          );
        })}
      </Form>
    </Modal>
  );
};

export default CreateResourcePoolFromResourceHandleModal;
