import React, { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import useSWR from 'swr';
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  PageSection,
  Split,
  SplitItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import {
  apiPaths,
  deleteMultiWorkshop,
  fetcher,
} from '@app/api';
import {
  MultiWorkshop,
} from '@app/types';
import {
  compareK8sObjects,
} from '@app/util';
import useSession from '@app/utils/useSession';
import { useLocation } from 'react-router-dom';
import Modal, { useModal } from '@app/Modal/Modal';
import ProjectSelector from '@app/components/ProjectSelector';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import Label from '@app/components/Label';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import MultiWorkshopItemDetails from './MultiWorkshopItemDetails';

import './multiworkshop-item.css';

export interface ModalState {
  action?: string;
  multiworkshop?: MultiWorkshop;
}

const MultiWorkshopItemComponent: React.FC<{
  activeTab: string;
  serviceNamespaceName: string;
  multiworkshopName: string;
}> = ({ activeTab, serviceNamespaceName, multiworkshopName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, serviceNamespaces } = useSession().getSession();
  const [modalAction, openModalAction] = useModal();
  const [modalState, setModalState] = useState<ModalState>({});

  const showModal = useCallback(
    ({ action, multiworkshop }: ModalState) => {
      setModalState({ action, multiworkshop });
      openModalAction();
    },
    [openModalAction],
  );

  const {
    data: multiworkshop,
    mutate: mutateMultiWorkshop,
  } = useSWR<MultiWorkshop>(
    apiPaths.MULTIWORKSHOP({
      namespace: serviceNamespaceName,
      multiworkshopName: multiworkshopName,
    }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
    },
  );

  async function onMultiWorkshopDeleteConfirm(): Promise<void> {
    if (modalState.multiworkshop) {
      await deleteMultiWorkshop(modalState.multiworkshop);
      navigate(`/admin/multiworkshops/${serviceNamespaceName}`);
    }
  }

  function getMultiWorkshopDisplayName(multiworkshop?: MultiWorkshop): string {
    if (!multiworkshop) return multiworkshopName;
    return multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  }

  if (!multiworkshop) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Modal
        ref={modalAction}
        onConfirm={onMultiWorkshopDeleteConfirm}
        title={`Delete multi-workshop ${getMultiWorkshopDisplayName(multiworkshop)}?`}
      >
        <p>All associated workshops and provisioned services WILL NOT be deleted.</p>
      </Modal>

      {isAdmin || serviceNamespaces.length > 1 ? (
        <PageSection hasBodyWrapper={false} key="topbar" className="multiworkshop-item__topbar">
          <ProjectSelector
            currentNamespaceName={serviceNamespaceName}
            onSelect={(namespace) => {
              if (namespace) {
                navigate(`/admin/multiworkshops/${namespace.name}${location.search}`);
              } else {
                navigate(`/admin/multiworkshops${location.search}`);
              }
            }}
          />
        </PageSection>
      ) : null}

      <PageSection hasBodyWrapper={false} key="header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Breadcrumb>
              <BreadcrumbItem to="/admin/multiworkshops">Multi-Workshops</BreadcrumbItem>
              <BreadcrumbItem to={`/admin/multiworkshops/${serviceNamespaceName}`}>
                {serviceNamespaceName}
              </BreadcrumbItem>
              <BreadcrumbItem isActive>{getMultiWorkshopDisplayName(multiworkshop)}</BreadcrumbItem>
            </Breadcrumb>
            <div style={{paddingTop: 'var(--pf-t--global--spacer--lg)'}}>
            <Split hasGutter style={{ alignItems: 'center' }}>
              <SplitItem>
                <Title headingLevel="h4" size="xl">
                  {getMultiWorkshopDisplayName(multiworkshop)}
                </Title>
              </SplitItem>
              <SplitItem>
                <Label>
                  MultiWorkshop
                </Label>
              </SplitItem>
            </Split></div>
          </SplitItem>
          <SplitItem>
            <Bullseye>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 'var(--pf-t--global--spacer--sm)',
                }}
              >
                {isAdmin ? (
                  <ButtonCircleIcon
                    key="actions__delete"
                    onClick={() => showModal({ action: 'delete', multiworkshop })}
                    description="Delete"
                    icon={TrashIcon}
                  />
                ) : null}
              </div>
            </Bullseye>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection hasBodyWrapper={false} key="body" style={{paddingTop: 0, flexGrow: 1}}>
        <Tabs
          activeKey={activeTab || 'details'}
          onSelect={(e, tabIndex) => navigate(`/admin/multiworkshops/${serviceNamespaceName}/${multiworkshopName}/${tabIndex}`)}
        >
          {/* @ts-ignore */}
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            {activeTab === 'details' ? (
              <MultiWorkshopItemDetails
                onMultiWorkshopUpdate={(updatedMultiWorkshop: MultiWorkshop) => mutateMultiWorkshop(updatedMultiWorkshop)}
                multiworkshop={multiworkshop}
                showModal={showModal}
              />
            ) : null}
          </Tab>
          {/* @ts-ignore */}
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            {activeTab === 'yaml' ? (
              <Editor
                height="500px"
                language="yaml"
                options={{ readOnly: true }}
                theme="vs-dark"
                value={yaml.dump(multiworkshop)}
              />
            ) : null}
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const MultiWorkshopItem: React.FC<{}> = () => {
  const { name: multiworkshopName, namespace: serviceNamespaceName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage namespace={serviceNamespaceName} name={multiworkshopName} type="MultiWorkshop">
      <MultiWorkshopItemComponent
        activeTab={activeTab}
        multiworkshopName={multiworkshopName}
        serviceNamespaceName={serviceNamespaceName}
      />
    </ErrorBoundaryPage>
  );
};

export default MultiWorkshopItem;
