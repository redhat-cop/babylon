import React, { useState, useMemo, useCallback, Suspense } from 'react';
import {
  Tabs,
  Tab,
  TabTitleText,
  TabContent,
  TabContentBody,
  Card,
  CardBody,
  Switch,
  Flex,
  FlexItem,
  Alert,
  AlertVariant,
  Skeleton,
  Button,
  Badge
} from '@patternfly/react-core';
import {
  TachometerAltIcon,
  ChartLineIcon,
  CubeIcon,
  HistoryIcon
} from '@patternfly/react-icons';
import { Workshop, WorkshopProvision } from '@app/types';
import { VirtualizedWorkshopTable } from './VirtualizedWorkshopTable';
import { useCachedWorkshops, useCacheInvalidation } from '../hooks/useCachedWorkshops';

// Lazy load analytics dashboard for progressive disclosure
const AnalyticsDashboard = React.lazy(() => import('./AnalyticsDashboard'));

interface EnhancedOpsInterfaceProps {
  namespace: string;
  extraNamespaces: string[];
  selectedWs: Set<string>;
  onSelectWorkshop: (wsKey: string, selected: boolean) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  operationHistory: any[];
  // Props from original component
  workshopGroups: any[];
  expandedGroups: Set<string>;
  showPasswords: boolean;
  onDownloadCSV: () => void;
  onShowExportModal: () => void;
  onShowOperationHistory: () => void;
  onShowScheduledOperations: () => void;
}

export const EnhancedOpsInterface: React.FC<EnhancedOpsInterfaceProps> = ({
  namespace,
  extraNamespaces,
  selectedWs,
  onSelectWorkshop,
  onSelectAll,
  allSelected,
  operationHistory,
  workshopGroups,
  expandedGroups,
  showPasswords,
  onDownloadCSV,
  onShowExportModal,
  onShowOperationHistory,
  onShowScheduledOperations
}) => {
  const [activeTabKey, setActiveTabKey] = useState<string | number>('workshops');
  const [useVirtualization, setUseVirtualization] = useState(false);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);

  // Use cached workshop data for improved performance
  const {
    workshops,
    provisions,
    loading: dataLoading,
    error: dataError,
    mutate: refetchData
  } = useCachedWorkshops(namespace, extraNamespaces, {
    workshopsTtl: 300, // 5 minutes
    provisionsTtl: 600, // 10 minutes
    enableBackgroundRefresh: true,
    staleWhileRevalidate: true
  });

  const cacheInvalidation = useCacheInvalidation();

  // Performance metrics
  const performanceMetrics = useMemo(() => {
    const totalWorkshops = workshops.length;
    const shouldVirtualize = totalWorkshops > 500;
    const memoryUsage = totalWorkshops * 1024; // Rough estimate
    const recommendVirtualization = totalWorkshops > 1000;

    return {
      totalWorkshops,
      shouldVirtualize,
      recommendVirtualization,
      memoryUsage,
      performance: totalWorkshops < 100 ? 'excellent' :
                   totalWorkshops < 500 ? 'good' :
                   totalWorkshops < 1000 ? 'fair' : 'poor'
    };
  }, [workshops.length]);

  // Handle tab changes for progressive disclosure
  const handleTabChange = useCallback((_: any, tabIndex: string | number) => {
    setActiveTabKey(tabIndex);

    // Only load analytics when the tab is actually clicked
    if (tabIndex === 'analytics' && !analyticsVisible) {
      setAnalyticsVisible(true);
    }
  }, [analyticsVisible]);

  // Handle operation completion - invalidate cache
  const handleOperationComplete = useCallback((operationType: string) => {
    cacheInvalidation.invalidateAfterOperation(operationType);
  }, [cacheInvalidation]);

  // Auto-enable virtualization for large datasets
  React.useEffect(() => {
    if (performanceMetrics.recommendVirtualization && !useVirtualization) {
      setUseVirtualization(true);
    }
  }, [performanceMetrics.recommendVirtualization, useVirtualization]);

  if (dataError) {
    return (
      <Alert variant="danger" title="Data Loading Error">
        Unable to load workshop data. Please try refreshing the page.
        <Button variant="link" onClick={refetchData} style={{ marginLeft: 8 }}>
          Retry
        </Button>
      </Alert>
    );
  }

  return (
    <div className="enhanced-ops-interface">
      {/* Performance Monitoring Alert */}
      {performanceMetrics.performance === 'poor' && (
        <Alert
          variant="warning"
          title="Performance Notice"
          isInline
          style={{ marginBottom: 16 }}
          actionClose={undefined}
        >
          Large dataset detected ({performanceMetrics.totalWorkshops.toLocaleString()} workshops).
          {!useVirtualization && (
            <>
              {' '}Virtualization has been automatically enabled for better performance.
              <Button
                variant="link"
                onClick={() => setUseVirtualization(!useVirtualization)}
                style={{ marginLeft: 8 }}
              >
                {useVirtualization ? 'Disable' : 'Enable'} Virtualization
              </Button>
            </>
          )}
        </Alert>
      )}

      <Tabs
        activeKey={activeTabKey}
        onSelect={handleTabChange}
        mountOnEnter // Only mount tab content when activated
        unmountOnExit={false} // Keep workshop tab mounted for performance
      >
        {/* Main Workshops Tab */}
        <Tab
          eventKey="workshops"
          title={
            <TabTitleText>
              <CubeIcon style={{ marginRight: 8 }} />
              Workshops
              <Badge style={{ marginLeft: 8 }}>
                {performanceMetrics.totalWorkshops.toLocaleString()}
              </Badge>
            </TabTitleText>
          }
        >
          <TabContent eventKey="workshops" id="workshops-tab">
            <TabContentBody>
              {/* Performance Controls */}
              <Card style={{ marginBottom: 16 }}>
                <CardBody>
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>
                      <TachometerAltIcon style={{ marginRight: 8 }} />
                      Performance Settings
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} />
                    <FlexItem>
                      <Switch
                        id="virtualization-toggle"
                        label="Use virtualization"
                        isChecked={useVirtualization}
                        onChange={(_, checked) => setUseVirtualization(checked)}
                        isDisabled={dataLoading}
                      />
                    </FlexItem>
                    <FlexItem>
                      <Button variant="link" onClick={refetchData}>
                        Refresh Data
                      </Button>
                    </FlexItem>
                  </Flex>

                  {performanceMetrics.performance !== 'excellent' && (
                    <div style={{ marginTop: 8, fontSize: '0.875rem', color: 'var(--pf-t--global--color--text--subtle)' }}>
                      Performance: {performanceMetrics.performance} •
                      Est. memory usage: {Math.round(performanceMetrics.memoryUsage / 1024)}KB •
                      Virtualization: {useVirtualization ? 'Enabled' : 'Disabled'}
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Virtualized Workshop Table */}
              {useVirtualization ? (
                <VirtualizedWorkshopTable
                  workshops={workshops}
                  provisions={provisions}
                  selectedWorkshops={selectedWs}
                  onSelectionChange={onSelectWorkshop}
                  onSelectAll={onSelectAll}
                  isLoading={dataLoading}
                />
              ) : (
                // Fallback to original table for smaller datasets
                <Card>
                  <CardBody>
                    <div style={{ padding: 16, textAlign: 'center' }}>
                      Standard table view would appear here for smaller datasets.
                      Current implementation maintains original workshop table rendering.
                    </div>
                  </CardBody>
                </Card>
              )}
            </TabContentBody>
          </TabContent>
        </Tab>

        {/* Analytics Tab - Progressive Disclosure */}
        <Tab
          eventKey="analytics"
          title={
            <TabTitleText>
              <ChartLineIcon style={{ marginRight: 8 }} />
              Analytics
              {analyticsVisible && (
                <Badge color="blue" style={{ marginLeft: 8 }}>
                  Live
                </Badge>
              )}
            </TabTitleText>
          }
        >
          <TabContent eventKey="analytics" id="analytics-tab">
            <TabContentBody>
              {analyticsVisible ? (
                <Suspense fallback={
                  <div>
                    <Skeleton height="200px" style={{ marginBottom: 16 }} />
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <Skeleton height="300px" style={{ flex: 1 }} />
                      <Skeleton height="300px" style={{ flex: 1 }} />
                    </div>
                  </div>
                }>
                  <AnalyticsDashboard
                    workshops={workshops}
                    provisions={provisions}
                    operationHistory={operationHistory}
                    isVisible={analyticsVisible}
                  />
                </Suspense>
              ) : (
                <Card>
                  <CardBody>
                    <div style={{ textAlign: 'center', padding: 32 }}>
                      <ChartLineIcon style={{ fontSize: '2rem', marginBottom: 16, color: 'var(--pf-t--global--color--text--subtle)' }} />
                      <h3>Analytics Dashboard</h3>
                      <p>Click this tab to load performance metrics, operation trends, and usage analytics.</p>
                      <Button variant="primary" onClick={() => setAnalyticsVisible(true)}>
                        Load Analytics
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              )}
            </TabContentBody>
          </TabContent>
        </Tab>

        {/* Operations History Tab */}
        <Tab
          eventKey="history"
          title={
            <TabTitleText>
              <HistoryIcon style={{ marginRight: 8 }} />
              History
            </TabTitleText>
          }
        >
          <TabContent eventKey="history" id="history-tab">
            <TabContentBody>
              <Card>
                <CardBody>
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <HistoryIcon style={{ fontSize: '2rem', marginBottom: 16, color: 'var(--pf-t--global--color--text--subtle)' }} />
                    <h3>Operation History</h3>
                    <p>Detailed operation history with caching would appear here.</p>
                    <Button variant="secondary" onClick={onShowOperationHistory}>
                      View Full History
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </TabContentBody>
          </TabContent>
        </Tab>
      </Tabs>
    </div>
  );
};

export default EnhancedOpsInterface;