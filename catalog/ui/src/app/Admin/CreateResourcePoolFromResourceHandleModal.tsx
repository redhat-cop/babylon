import React, { CSSProperties, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Checkbox, Form, FormGroup, NumberInput, TextArea, TextInput, Tooltip } from '@patternfly/react-core';
import { ResourceClaim, ResourceHandle } from '@app/types';
import { createResourcePool, getResourcePool } from '@app/api';
import { BABYLON_DOMAIN, FETCH_BATCH_LIMIT } from '@app/util';
import yaml from 'js-yaml';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import useMatchMutate from '@app/utils/useMatchMutate';

const formFieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 'var(--pf-global--spacer--sm)',
  alignItems: 'center',
};

const CreateResourcePoolFromResourceHandleModal: React.FC<{
  resourceClaim?: ResourceClaim;
  resourceHandle: ResourceHandle;
  setOnConfirmCb?: (_: any) => Promise<void>;
  setIsDisabled?: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ resourceClaim, resourceHandle, setOnConfirmCb, setIsDisabled }) => {
  const navigate = useNavigate();
  const matchMutate = useMatchMutate();
  const [resourcePoolName, setResourcePoolName] = useState(
    resourceClaim
      ? resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/externalPlatformUrl`] &&
        resourceClaim.metadata.name.match(/-[0-9a-f]{4}$/)
        ? resourceClaim.metadata.name.substring(0, resourceClaim.metadata.name.length - 5).substring(0, 63)
        : resourceClaim.metadata.name.replace(/-[0-9]+$/, '').substring(0, 63)
      : resourceHandle.spec.resources[0].provider.name.substring(0, 63)
  );
  const [nameConflict, setNameConflict] = useState(false);
  const [minAvailable, setMinAvailable] = useState(1);
  const [stopAfterProvision, setStopAfterProvision] = useState(true);
  const [unclaimed, setUnclaimed] = useState(7);
  const [resourcePoolDescription, setResourcePoolDescription] = useState('');
  const { lifespan } = resourceHandle.spec;
  const [resources, setResources] = useState(
    resourceHandle.spec.resources.map((resource) => ({
      name: resource.name,
      jobVars: resource.template.spec.vars?.job_vars ? yaml.dump(resource.template.spec.vars.job_vars) : '',
      provider: resource.provider,
    }))
  );

  const poolNameValidated = resourcePoolName.match(/^[a-z0-9A-Z]([a-z0-9A-Z\-._]*[a-z0-9A-Z])?$/) !== null;

  const checkForNameConflict = useCallback(
    async (checkName: string) => {
      try {
        setIsDisabled(true);
        const existingResourcePool = await getResourcePool(checkName);
        if (existingResourcePool) {
          setNameConflict(true);
          setIsDisabled(true);
        }
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          setNameConflict(false);
          setIsDisabled(!poolNameValidated);
        } else {
          throw error;
        }
      }
    },
    [poolNameValidated, setIsDisabled]
  );

  const onConfirm = useCallback(async () => {
    const resourcePool = await createResourcePool({
      apiVersion: 'poolboy.gpte.redhat.com/v1',
      kind: 'ResourcePool',
      metadata: {
        name: resourcePoolName,
        namespace: 'poolboy',
        annotations: {
          [`${BABYLON_DOMAIN}/description`]: resourcePoolDescription,
        },
      },
      spec: {
        lifespan: {
          default: lifespan?.default || '7d',
          maximum: lifespan?.maximum || '14d',
          relativeMaximum: lifespan?.relativeMaximum || '7d',
          unclaimed: `${unclaimed}d`,
        },
        minAvailable: minAvailable,
        resources: [
          ...resources.map((resource) => {
            return {
              name: resource.name,
              provider: resource.provider,
              template: {
                spec: {
                  vars: {
                    job_vars: yaml.load(resource.jobVars),
                  },
                },
              },
            };
          }),
        ],
      },
    });
    matchMutate([
      { name: 'RESOURCE_POOL', arguments: { resourcePoolName }, data: resourcePool },
      { name: 'RESOURCE_POOLS', arguments: { limit: FETCH_BATCH_LIMIT }, data: undefined },
    ]);
    navigate(`/admin/resourcepools/${resourcePoolName}`);
  }, [resourcePoolName, resourcePoolDescription, lifespan, unclaimed, minAvailable, resources, matchMutate, navigate]);

  useEffect(() => {
    checkForNameConflict(resourcePoolName);
  }, [checkForNameConflict, resourcePoolName]);

  useEffect(() => {
    setOnConfirmCb(() => onConfirm);
  }, [onConfirm, setOnConfirmCb]);

  const setResourceJobVars = (idx: number, value: string) => {
    const resourcesCpy = [...resources];
    resourcesCpy[idx].jobVars = value;
    setResources(resourcesCpy);
  };

  return (
    <Form>
      <FormGroup isRequired label="ResourcePool Name" fieldId="resourcePoolName">
        <div style={formFieldStyle}>
          <TextInput
            isRequired
            maxLength={63}
            id="resourcePoolName"
            name="resourcePoolName"
            value={resourcePoolName}
            onChange={(value) => {
              setResourcePoolName(value);
            }}
            validated={!nameConflict && poolNameValidated ? 'success' : 'error'}
          />
          <Tooltip position="right" content={<div>ResourcePool Name must be unique</div>}>
            <OutlinedQuestionCircleIcon aria-label="More info" className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
      <FormGroup label="ResourcePool Description" fieldId="resoucePoolDescription">
        <div style={formFieldStyle}>
          <TextArea
            id="resoucePoolDescription"
            name="resoucePoolDescription"
            onChange={setResourcePoolDescription}
            value={resourcePoolDescription}
          />

          <Tooltip position="right" content={<div>Used only for operational and identification pruposes.</div>}>
            <OutlinedQuestionCircleIcon aria-label="More info" className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
      <FormGroup label="Minimum Available" fieldId="minAvailable">
        <div style={formFieldStyle}>
          <NumberInput
            id="minAvailable"
            max={99}
            min={0}
            name="minAvailable"
            value={minAvailable}
            onChange={(event: React.FormEvent<HTMLInputElement>) => {
              const value = parseInt(event.currentTarget.value);
              if (isNaN(value)) {
                return;
              }
              setMinAvailable(value < 0 ? 0 : value > 99 ? 99 : value);
            }}
            onMinus={() => setMinAvailable(minAvailable - 1)}
            onPlus={() => setMinAvailable(minAvailable + 1)}
          />
          <Tooltip
            position="right"
            isContentLeftAligned={true}
            content={
              <div>
                Defines how many unassigned ResourceHandles should be maintained in the pool. <br /> Increasing this
                number will cause Poolboy to provision more ResourceHandles.
              </div>
            }
          >
            <OutlinedQuestionCircleIcon aria-label="More info" className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
      <FormGroup label="Stop after provision" fieldId="stopAfterProvision">
        <div style={formFieldStyle}>
          <Checkbox
            id="stopAfterProvision"
            label="enabled"
            name="stopAfterProvision"
            isChecked={stopAfterProvision}
            onChange={(checked) => setStopAfterProvision(checked)}
          />

          <Tooltip
            position="right"
            content={
              <div>
                When enabled the ResourceHandle created will default into a `stopped` state upon provisioning
                completion. While most catalog items should be capable of being idled, there are some that might not be
                able to - such as the Ansible workshops. Analysis and risk assessment should be done before employing
                these idling options on pooled resources.
              </div>
            }
          >
            <OutlinedQuestionCircleIcon aria-label="More info" className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
      <FormGroup label="Unclaimed lifespan" fieldId="unclaimed">
        <div style={formFieldStyle}>
          <NumberInput
            id="unclaimed"
            max={99}
            min={0}
            name="unclaimed"
            value={unclaimed}
            onChange={(event: React.FormEvent<HTMLInputElement>) => {
              const value = parseInt(event.currentTarget.value);
              if (isNaN(value)) {
                return;
              }
              setUnclaimed(value < 0 ? 0 : value);
            }}
            onMinus={() => setUnclaimed(unclaimed - 1)}
            onPlus={() => setUnclaimed(unclaimed + 1)}
          />
          <Tooltip
            position="right"
            content={
              <div>Defines how many days an unclaimed ResourceHandle can be in the pool before being retired.</div>
            }
          >
            <OutlinedQuestionCircleIcon aria-label="More info" className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
      {resources.map((resource, idx) => {
        const resourceName = resource.name || resource.provider.name;
        const resourceLabel =
          resourceName === 'babylon' ? 'Babylon Legacy CloudForms Integration' : `Resource: ${resourceName}`;
        return (
          <FormGroup key={idx} label={`${resourceLabel} - Job vars`} fieldId={`resource-${idx}`}>
            <div style={formFieldStyle}>
              <TextArea
                id={`resource-${idx}`}
                name={`resource-${idx}`}
                onChange={(value) => setResourceJobVars(idx, value)}
                value={resource.jobVars}
              />

              <Tooltip
                position="right"
                content={
                  <div>
                    If your pool doesn't match the exact variables that the intended requester is going to use, then
                    your pool will not be used at all.
                  </div>
                }
              >
                <OutlinedQuestionCircleIcon aria-label="More info" className="tooltip-icon-only" />
              </Tooltip>
            </div>
          </FormGroup>
        );
      })}
    </Form>
  );
};

export default CreateResourcePoolFromResourceHandleModal;
