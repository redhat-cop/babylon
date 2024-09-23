import React, { useMemo } from 'react';
import { Badge, Label, Panel, PanelMain, Title } from '@patternfly/react-core';
import useSWR from 'swr';
import { apiPaths, fetcher } from '@app/api';
import { CatalogItem, CatalogItemIncidents } from '@app/types';
import { Table /* data-codemods */, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import TimeInterval from '@app/components/TimeInterval';
import { fetchCatalog } from '@app/Catalog/Catalog';
import useSession from '@app/utils/useSession';
import { BABYLON_DOMAIN, displayName, getStageFromK8sObject } from '@app/util';
import { getStage, getStatus } from '@app/Catalog/catalog-utils';
import StatusPageIcons from '@app/components/StatusPageIcons';

import './admin.css';

const CatalogIncidentsAlertList: React.FC = () => {
    const { catalogNamespaces } = useSession().getSession();
    const catalogNamespaceNames = catalogNamespaces.map((ci) => ci.name);
    const { data: catalogIncidents } = useSWR<CatalogItemIncidents>(
        apiPaths.CATALOG_ITEMS_ACTIVE_INCIDENTS({}),
        fetcher
    );
    const { data: catalogItemsArr } = useSWR<CatalogItem[]>(
        apiPaths.CATALOG_ITEMS({ namespace: 'all-catalogs' }),
        () => fetchCatalog(catalogNamespaceNames)
    );

    const ciIncidents = useMemo(() => {
        if (catalogItemsArr && catalogIncidents) {
            return catalogIncidents.items.map(i => {
                const ci = catalogItemsArr.find(c => c.metadata.labels?.['gpte.redhat.com/asset-uuid'] === i.asset_uuid && getStageFromK8sObject(c) === i.stage);
                if (ci) {
                    ci.metadata.annotations[`${BABYLON_DOMAIN}/incident`] = JSON.stringify(i);
                    return ci;
                }
                return null;
            }).filter(Boolean);
        } 
        return [];
    }, [catalogItemsArr, catalogIncidents]);

    return (
        <div>
            <Panel variant="raised">
                <div style={{ padding: 'var(--pf-v5-global--spacer--md)' }}>
                <Title headingLevel="h3" size="md">
                    Catalog Active Incidents
                </Title>
                </div>
                <PanelMain>
                {ciIncidents.length > 0 ? (
                    <Table aria-label="Catalog active incidents">
                    <Thead>
                        <Tr>
                            <Th>CatalogItem</Th>
                            <Th>Status</Th>
                            <Th>Disabled</Th>
                            <Th>Last updated</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {ciIncidents.map((ci) => (
                            <Tr key={ci.metadata.uid}>
                                <Td dataLabel="level"
                                    style={{
                                        textTransform: 'capitalize',
                                        display: 'flex',
                                        gap: 'var(--pf-v5-global--spacer--xs)',
                                        alignItems: 'center',
                                    }}>
                                        <a href={`/admin/catalogitems/${ci.metadata.namespace}/${ci.metadata.name}`}>
                                            {displayName(ci)}
                                        </a>
                                        { getStage(ci) === 'dev' ? (
                                            <Badge className="catalog-item-card__badge--dev">development</Badge>
                                        ) : getStage(ci) === 'test' ? (
                                            <Badge className="catalog-item-card__badge--test">test</Badge>
                                        ) : getStage(ci) === 'event' ? (
                                            <Badge className="catalog-item-card__badge--event">event</Badge>
                                        ) : null}
                                </Td>
                                <Td dataLabel="status">
                                    <Label
                                        className={`catalog-item-details__status--${getStatus(ci).name.replace(/\s+/g, '-').toLowerCase()}`}
                                        variant="outline"
                                        render={({ className, content }) =>
                                            getStatus(ci).incidentUrl ? (
                                                <a href={getStatus(ci).incidentUrl} target="_blank" rel="noreferrer" className={className}>
                                                {content}
                                                </a>
                                            ) : (
                                                <p className={className}>{content}</p>
                                            )}
                                        icon={<StatusPageIcons style={{ width: '20px' }} status={getStatus(ci).name} />}
                                    >
                                        {getStatus(ci).name}
                                    </Label>
                                </Td>
                                <Td dataLabel="disabled">{getStatus(ci).disabled.toString()}</Td>
                                <Td dataLabel="updated">
                                    <TimeInterval toTimestamp={getStatus(ci).updated.updatedAt} />
                                </Td>
                            </Tr>
                        ))}
                    </Tbody>
                    </Table>
                ) : (
                    <p style={{ padding: 'var(--pf-v5-global--spacer--md)' }}>No active catalog incidents.</p>
                )}
                </PanelMain>
            </Panel>
        </div>
    );
};

export default CatalogIncidentsAlertList;
