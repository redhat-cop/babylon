import { apiPaths, fetcher, fetcherItemsInAllPages } from '@app/api';
import { AnarchySubject, K8sObject, NamespaceList, ResourceClaim } from '@app/types';
import {
  BABYLON_DOMAIN,
  compareK8sObjectsArr,
  DEMO_DOMAIN,
  displayName,
  FETCH_BATCH_LIMIT,
  namespaceToServiceNamespaceMapper,
} from '@app/util';
import {
  Breadcrumb,
  BreadcrumbItem,
  CardBody,
  CardHeader,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import useSWRImmutable from 'swr/immutable';

import './multi-asset.css';
import useSession from '@app/utils/useSession';
import useSWR from 'swr';
import ArrowRightIcon from '@patternfly/react-icons/dist/js/icons/arrow-right-icon';
import ServiceStatus from './ServiceStatus';
import { getMostRelevantResourceAndTemplate } from './service-utils';

const MultiAsset: React.FC<{ namespace: string; multiAsset: string }> = ({ namespace, multiAsset }) => {
  const { isAdmin, groups, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const { data: userNamespaceList } = useSWR<NamespaceList>(
    isAdmin ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : '',
    fetcher,
  );
  const serviceNamespaces = useMemo(() => {
    return isAdmin ? userNamespaceList.items.map(namespaceToServiceNamespaceMapper) : sessionServiceNamespaces;
  }, [isAdmin, sessionServiceNamespaces, userNamespaceList]);
  const serviceNamespace = serviceNamespaces.find((ns) => ns.name === namespace) || {
    name: namespace,
    displayName: namespace,
  };
  const { data: assets, mutate } = useSWR<ResourceClaim[]>(
    apiPaths.RESOURCE_CLAIMS({
      namespace,
      labelSelector: `${DEMO_DOMAIN}/multiAssetGroupId=${multiAsset}`,
      limit: 'ALL',
    }),
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_CLAIMS({
          namespace,
          labelSelector: `${DEMO_DOMAIN}/multiAssetGroupId=${multiAsset}`,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    },
  );

  return (
    <>
      <PageSection key="head" className="services-item__head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            {isAdmin || serviceNamespaces.length > 1 ? (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/services" className={className}>
                      Services
                    </Link>
                  )}
                />
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to={`/services/${namespace}`} className={className}>
                      {displayName(serviceNamespace)}
                    </Link>
                  )}
                />
                <BreadcrumbItem>Multi-Asset</BreadcrumbItem>
              </Breadcrumb>
            ) : (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to={`/services/${namespace}`} className={className}>
                      Services
                    </Link>
                  )}
                />
                <BreadcrumbItem>Multi-Asset</BreadcrumbItem>
              </Breadcrumb>
            )}
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" className="multi-asset__page" variant={PageSectionVariants.light}>
        <div className="multi-asset">
          {assets.map((asset) => (
            <Link
              className="multi-asset__card"
              to={
                asset.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceUrl`] ||
                (asset.status?.resources || [])
                  .map((r: { state?: K8sObject }) => r.state)
                  .map((r) => {
                    let data = r?.data;
                    if (r?.kind === 'AnarchySubject') {
                      const anarchySubject = r as AnarchySubject;
                      data = anarchySubject.spec?.vars?.provision_data;
                    }
                    return data?.labUserInterfaceUrl || data?.lab_ui_url || data?.bookbag_url;
                  })
                  .find((u) => u != null)
              }
            >
              <Title className="multi-asset__asset-title" headingLevel="h5">
                {displayName(asset)}
              </Title>
              {asset.spec.resources?.length > 0 ||
              asset.status?.summary ||
              new Date(asset.spec.lifespan.start).getTime() > new Date().getTime() ? (
                <ServiceStatus
                  creationTime={Date.parse(asset.metadata.creationTimestamp)}
                  resource={getMostRelevantResourceAndTemplate(asset).resource}
                  resourceTemplate={getMostRelevantResourceAndTemplate(asset).template}
                  resourceClaim={asset}
                  summary={asset.status?.summary}
                />
              ) : null}
              <ArrowRightIcon />
            </Link>
          ))}
        </div>
      </PageSection>
    </>
  );
};

export default MultiAsset;
