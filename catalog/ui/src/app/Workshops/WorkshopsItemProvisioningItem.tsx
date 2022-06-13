import React, { useEffect, useReducer, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

import yaml from 'js-yaml';

import {
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
} from '@patternfly/react-core';

import { getCatalogItem, patchWorkshopProvision } from '@app/api';
import { selectUserIsAdmin } from '@app/store';
import { CatalogItem, Workshop, WorkshopProvision } from '@app/types';
import { displayName } from '@app/util';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';

import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import PatientNumberInput from '@app/components/PatientNumberInput';

interface EditableWorkshopProvisionSpecFields {
  count?: number;
  concurrency?: number;
  startDelay?: number;
}

const WorkshopsItemProvisioningItem: React.FC<{
  onWorkshopProvisionUpdate: (workshopProvision: WorkshopProvision) => void;
  workshop: Workshop;
  workshopProvision: WorkshopProvision;
}> = ({ onWorkshopProvisionUpdate, workshopProvision }) => {
  const componentWillUnmount = useRef(false);
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  const [catalogItemFetchState, reduceCatalogItemFetchState] = useReducer(k8sFetchStateReducer, null);
  const catalogItemName: string = workshopProvision.spec.catalogItem?.name;
  const catalogItemNamespace: string = workshopProvision.spec.catalogItem?.namespace;
  const catalogItem: CatalogItem = catalogItemFetchState?.item as CatalogItem;

  async function fetchCatalogItem(): Promise<void> {
    let catalogItem: CatalogItem = null;
    try {
      catalogItem = await getCatalogItem(catalogItemNamespace, catalogItemName);
    } catch (error) {
      if (!(error instanceof Response && error.status === 404)) {
        throw error;
      }
    }
    if (!catalogItemFetchState.activity.canceled) {
      reduceCatalogItemFetchState({
        type: 'post',
        item: catalogItem,
      });
    }
  }

  async function patchWorkshopProvisionSpec(patch: EditableWorkshopProvisionSpecFields) {
    onWorkshopProvisionUpdate(
      await patchWorkshopProvision({
        name: workshopProvision.metadata.name,
        namespace: workshopProvision.metadata.namespace,
        patch: { spec: patch },
      })
    );
  }

  // Track unmount for other effect cleanups
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Start fetching CatalogItem
  useEffect(() => {
    if (catalogItemName && catalogItemNamespace) {
      reduceCatalogItemFetchState({ type: 'startFetch' });
    }
  }, [catalogItemName, catalogItemNamespace]);

  // Fetch CatalogItem
  useEffect(() => {
    if (catalogItemFetchState?.canContinue) {
      fetchCatalogItem();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(catalogItemFetchState);
      }
    };
  }, [catalogItemFetchState]);

  return (
    <>
      <DescriptionList isHorizontal>
        <DescriptionListGroup>
          <DescriptionListTerm>Name</DescriptionListTerm>
          <DescriptionListDescription>
            {workshopProvision.metadata.name}
            {userIsAdmin ? <OpenshiftConsoleLink resource={workshopProvision} /> : null}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Catalog Item</DescriptionListTerm>
          <DescriptionListDescription>
            {catalogItemFetchState?.finished ? (
              catalogItem ? (
                <>
                  <Link to={`/catalog?item=${catalogItemNamespace}%2F${catalogItemName}`}>
                    {displayName(catalogItem)}
                  </Link>
                  {userIsAdmin ? <OpenshiftConsoleLink resource={catalogItem} /> : null}
                </>
              ) : (
                <p>
                  Missing catalog item {catalogItemName} in {catalogItemNamespace}!
                </p>
              )
            ) : (
              <LoadingIcon />
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Parameters</DescriptionListTerm>
          <DescriptionListDescription>
            <CodeBlock>
              <CodeBlockCode>{yaml.dump(workshopProvision.spec.parameters || {})}</CodeBlockCode>
            </CodeBlock>
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Count</DescriptionListTerm>
          <DescriptionListDescription>
            <PatientNumberInput
              min={0}
              max={200}
              onChange={(value: number) => patchWorkshopProvisionSpec({ count: value })}
              value={workshopProvision.spec.count}
            />{' '}
            service count to provision for workshop
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Concurrency</DescriptionListTerm>
          <DescriptionListDescription>
            <PatientNumberInput
              min={1}
              max={10}
              onChange={(value: number) => patchWorkshopProvisionSpec({ concurrency: value })}
              value={workshopProvision.spec.concurrency}
            />{' '}
            concurrent provision count
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Start Delay</DescriptionListTerm>
          <DescriptionListDescription>
            <PatientNumberInput
              min={10}
              max={999}
              onChange={(value: number) => patchWorkshopProvisionSpec({ startDelay: value })}
              value={workshopProvision.spec.startDelay}
            />{' '}
            seconds
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
    </>
  );
};

export default WorkshopsItemProvisioningItem;
