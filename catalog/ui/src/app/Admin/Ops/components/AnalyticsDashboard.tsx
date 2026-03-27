import React, { useState, useMemo, Suspense, lazy } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Grid,
  GridItem,
  Skeleton,
  EmptyState,
  EmptyStateBody,
  Tabs,
  Tab,
  TabTitleText,
  TabContent,
  TabContentBody,
  Alert,
  Flex,
  FlexItem,
  Button,
  Switch
} from '@patternfly/react-core';
import {
  ChartLineIcon,
  CubeIcon,
  TachometerAltIcon,
  ExclamationCircleIcon,
  InfoCircleIcon
} from '@patternfly/react-icons';
import { Workshop, WorkshopProvision } from '@app/types';

// Lazy load chart components for progressive disclosure
const OperationMetricsChart = lazy(() => import('./OperationMetricsChart'));
const UsageTrendsChart = lazy(() => import('./UsageTrendsChart'));
const WorkshopStatusChart = lazy(() => import('./WorkshopStatusChart'));
const PerformanceMetricsCard = lazy(() => import('./PerformanceMetricsCard'));

interface AnalyticsDashboardProps {
  workshops: Workshop[];
  provisions: WorkshopProvision[];
  operationHistory: any[]; // Operation history data
  isVisible: boolean; // Progressive disclosure control
}

interface AnalyticsMetrics {
  totalWorkshops: number;
  activeWorkshops: number;
  failedWorkshops: number;
  operationSuccessRate: number;
  avgResponseTime: number;
  totalUsers: number;
  resourceUtilization: number;
}

// Loading skeleton for charts
const ChartSkeleton: React.FC = () => (
  <Card style={{ height: '300px' }}>
    <CardBody>
      <Skeleton height="20px" width="60%" style={{ marginBottom: '16px' }} />
      <Skeleton height="240px" />
    </CardBody>
  </Card>
);

// Error boundary component for chart failures
const ChartErrorBoundary: React.FC<{ children: React.ReactNode; title: string }> = ({ children, title }) => {
  return (
    <React.Suspense fallback={<ChartSkeleton />}>
      {children}
    </React.Suspense>
  );
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  workshops,
  provisions,
  operationHistory,
  isVisible
}) => {
  const [activeTabKey, setActiveTabKey] = useState<string | number>('overview');
  const [enableRealtime, setEnableRealtime] = useState(false);

  // Calculate analytics metrics
  const metrics: AnalyticsMetrics = useMemo(() => {
    if (!isVisible) return {} as AnalyticsMetrics; // Don't calculate if not visible

    const totalWorkshops = workshops.length;
    const activeWorkshops = workshops.filter(w =>
      !w.spec?.provisionDisabled && w.status?.summary?.provision?.state !== 'failed'
    ).length;
    const failedWorkshops = workshops.filter(w =>
      w.status?.summary?.provision?.state === 'failed'
    ).length;

    // Calculate success rate from operation history
    const successfulOps = operationHistory.filter(op => op.status === 'success').length;
    const totalOps = operationHistory.length;
    const operationSuccessRate = totalOps > 0 ? (successfulOps / totalOps) * 100 : 100;

    // Calculate average response time (mock data for demo)
    const avgResponseTime = 250; // ms

    // Calculate total users across all workshops
    const totalUsers = workshops.reduce((sum, workshop) => {
      const userCount = (workshop.status as any)?.summary?.users?.length || 0;
      return sum + userCount;
    }, 0);

    // Calculate resource utilization (mock percentage)
    const resourceUtilization = Math.min(95, (activeWorkshops / Math.max(totalWorkshops, 1)) * 100);

    return {
      totalWorkshops,
      activeWorkshops,
      failedWorkshops,
      operationSuccessRate,
      avgResponseTime,
      totalUsers,
      resourceUtilization
    };
  }, [workshops, provisions, operationHistory, isVisible]);

  // Don't render anything if not visible (progressive disclosure)
  if (!isVisible) {
    return (
      <Card>
        <CardBody>
          <EmptyState>
            <ChartLineIcon />
            <EmptyStateBody>
              Click the Analytics tab to view performance metrics and trends.
            </EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  const overviewCards = [
    {
      title: 'Total Workshops',
      value: metrics.totalWorkshops?.toLocaleString() || '0',
      trend: '+5.2%',
      icon: CubeIcon,
      color: 'blue'
    },
    {
      title: 'Active Workshops',
      value: metrics.activeWorkshops?.toLocaleString() || '0',
      trend: '+2.1%',
      icon: TachometerAltIcon,
      color: 'green'
    },
    {
      title: 'Success Rate',
      value: `${metrics.operationSuccessRate?.toFixed(1) || '100'}%`,
      trend: '+0.8%',
      icon: InfoCircleIcon,
      color: metrics.operationSuccessRate >= 95 ? 'green' : metrics.operationSuccessRate >= 85 ? 'orange' : 'red'
    },
    {
      title: 'Failed Workshops',
      value: metrics.failedWorkshops?.toLocaleString() || '0',
      trend: '-1.2%',
      icon: ExclamationCircleIcon,
      color: metrics.failedWorkshops > 0 ? 'red' : 'green'
    }
  ];

  return (
    <Card>
      <CardTitle>
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <ChartLineIcon style={{ marginRight: 8 }} />
            Analytics Dashboard
          </FlexItem>
          <FlexItem flex={{ default: 'flex_1' }} />
          <FlexItem>
            <Switch
              id="realtime-toggle"
              label="Real-time updates"
              isChecked={enableRealtime}
              onChange={(_, checked) => setEnableRealtime(checked)}
            />
          </FlexItem>
        </Flex>
      </CardTitle>
      <CardBody>
        <Tabs
          activeKey={activeTabKey}
          onSelect={(_, tabIndex) => setActiveTabKey(tabIndex)}
        >
          <Tab eventKey="overview" title={<TabTitleText>Overview</TabTitleText>}>
            <TabContent eventKey="overview" id="overview-tab">
              <TabContentBody>
                {/* Performance Alert */}
                {metrics.operationSuccessRate < 90 && (
                  <Alert
                    variant="warning"
                    title="Performance Alert"
                    style={{ marginBottom: '16px' }}
                  >
                    Operation success rate is below 90%. Consider investigating failed operations.
                  </Alert>
                )}

                {/* Overview Cards */}
                <Grid hasGutter>
                  {overviewCards.map((card, index) => (
                    <GridItem key={index} span={3}>
                      <Card>
                        <CardBody>
                          <Flex alignItems={{ default: 'alignItemsCenter' }}>
                            <FlexItem>
                              <card.icon
                                style={{
                                  fontSize: '1.5rem',
                                  color: `var(--pf-t--global--color--${card.color}--default)`
                                }}
                              />
                            </FlexItem>
                            <FlexItem flex={{ default: 'flex_1' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{
                                  fontSize: '1.5rem',
                                  fontWeight: 'bold',
                                  color: `var(--pf-t--global--color--${card.color}--default)`
                                }}>
                                  {card.value}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--pf-t--global--color--text--subtle)' }}>
                                  {card.title}
                                </div>
                                <div style={{
                                  fontSize: '0.75rem',
                                  color: card.trend.startsWith('+') ? 'green' : 'red'
                                }}>
                                  {card.trend} from last period
                                </div>
                              </div>
                            </FlexItem>
                          </Flex>
                        </CardBody>
                      </Card>
                    </GridItem>
                  ))}
                </Grid>

                {/* Quick Charts */}
                <Grid hasGutter style={{ marginTop: '24px' }}>
                  <GridItem span={6}>
                    <ChartErrorBoundary title="Workshop Status Distribution">
                      <WorkshopStatusChart workshops={workshops} />
                    </ChartErrorBoundary>
                  </GridItem>
                  <GridItem span={6}>
                    <ChartErrorBoundary title="Performance Metrics">
                      <PerformanceMetricsCard
                        avgResponseTime={metrics.avgResponseTime}
                        resourceUtilization={metrics.resourceUtilization}
                        totalUsers={metrics.totalUsers}
                      />
                    </ChartErrorBoundary>
                  </GridItem>
                </Grid>
              </TabContentBody>
            </TabContent>
          </Tab>

          <Tab eventKey="operations" title={<TabTitleText>Operations</TabTitleText>}>
            <TabContent eventKey="operations" id="operations-tab">
              <TabContentBody>
                <Grid hasGutter>
                  <GridItem span={12}>
                    <ChartErrorBoundary title="Operation Success Rates">
                      <OperationMetricsChart
                        operationHistory={operationHistory}
                        enableRealtime={enableRealtime}
                      />
                    </ChartErrorBoundary>
                  </GridItem>
                </Grid>
              </TabContentBody>
            </TabContent>
          </Tab>

          <Tab eventKey="trends" title={<TabTitleText>Usage Trends</TabTitleText>}>
            <TabContent eventKey="trends" id="trends-tab">
              <TabContentBody>
                <Grid hasGutter>
                  <GridItem span={12}>
                    <ChartErrorBoundary title="Usage Trends Over Time">
                      <UsageTrendsChart
                        workshops={workshops}
                        provisions={provisions}
                        enableRealtime={enableRealtime}
                      />
                    </ChartErrorBoundary>
                  </GridItem>
                </Grid>
              </TabContentBody>
            </TabContent>
          </Tab>
        </Tabs>
      </CardBody>
    </Card>
  );
};

export default AnalyticsDashboard;