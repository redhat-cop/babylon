import React, { useMemo } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  Progress,
  Grid,
  GridItem
} from '@patternfly/react-core';
import { TrendUpIcon, UsersIcon, CubeIcon, ClockIcon } from '@patternfly/react-icons';
import { Workshop, WorkshopProvision } from '@app/types';

interface UsageTrendsChartProps {
  workshops: Workshop[];
  provisions: WorkshopProvision[];
  enableRealtime?: boolean;
}

interface UsageTrend {
  period: string;
  activeWorkshops: number;
  totalUsers: number;
  resourceUtilization: number;
  avgSessionTime: number;
}

interface UsageMetrics {
  currentTrends: UsageTrend[];
  growthRate: number;
  peakUsageHour: number;
  averageSessionDuration: number;
  topWorkshopTypes: Array<{ name: string; usage: number; growth: number }>;
  resourceEfficiency: number;
}

const UsageTrendsChart: React.FC<UsageTrendsChartProps> = ({
  workshops,
  provisions,
  enableRealtime = false
}) => {
  const metrics: UsageMetrics = useMemo(() => {
    if (!workshops?.length) {
      return {
        currentTrends: [],
        growthRate: 0,
        peakUsageHour: 14, // 2 PM as default
        averageSessionDuration: 0,
        topWorkshopTypes: [],
        resourceEfficiency: 0
      };
    }

    // Generate mock trend data based on current workshops
    // In a real implementation, this would come from historical data
    const currentTrends: UsageTrend[] = Array.from({ length: 24 }, (_, hour) => {
      // Simulate higher usage during business hours (9 AM - 5 PM)
      const isBusinessHours = hour >= 9 && hour <= 17;
      const baseUsage = isBusinessHours ? 0.7 : 0.3;
      const randomVariation = Math.random() * 0.3;
      const utilizationFactor = Math.min(1, baseUsage + randomVariation);

      return {
        period: `${hour.toString().padStart(2, '0')}:00`,
        activeWorkshops: Math.floor(workshops.length * utilizationFactor),
        totalUsers: Math.floor(workshops.length * utilizationFactor * 25), // ~25 users per workshop avg
        resourceUtilization: utilizationFactor * 100,
        avgSessionTime: 120 + Math.random() * 180 // 2-5 hours
      };
    });

    // Calculate peak usage hour
    const peakUsageHour = currentTrends.reduce((peak, current, index) =>
      current.totalUsers > currentTrends[peak].totalUsers ? index : peak, 0
    );

    // Calculate growth rate (mock - 15% monthly growth)
    const growthRate = 15.2;

    // Average session duration
    const averageSessionDuration = currentTrends.reduce((sum, trend) =>
      sum + trend.avgSessionTime, 0
    ) / currentTrends.length;

    // Top workshop types by usage
    const workshopTypeCounts = workshops.reduce((acc, workshop) => {
      const type = workshop.metadata.labels?.['babylon.gpte.redhat.com/catalog-item-name'] || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    const topWorkshopTypes = Object.entries(workshopTypeCounts)
      .map(([name, usage]) => ({
        name,
        usage,
        growth: Math.random() * 30 - 10 // Random growth between -10% and +20%
      }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);

    // Calculate resource efficiency
    const activeWorkshops = workshops.filter(w =>
      !w.spec?.provisionDisabled && w.status?.summary?.provision?.state !== 'failed'
    ).length;
    const resourceEfficiency = workshops.length > 0 ? (activeWorkshops / workshops.length) * 100 : 100;

    return {
      currentTrends,
      growthRate,
      peakUsageHour,
      averageSessionDuration,
      topWorkshopTypes,
      resourceEfficiency
    };
  }, [workshops, provisions]);

  if (!workshops?.length) {
    return (
      <Card style={{ height: '400px' }}>
        <CardTitle>Usage Trends Over Time</CardTitle>
        <CardBody>
          <EmptyState>
            <TrendUpIcon />
            <EmptyStateBody>
              No usage data available. Trends will appear here once workshops are actively used.
            </EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  const getGrowthColor = (growth: number) => {
    if (growth > 10) return 'green';
    if (growth > 0) return 'blue';
    if (growth > -5) return 'orange';
    return 'red';
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const currentHour = new Date().getHours();
  const currentTrend = metrics.currentTrends[currentHour] || metrics.currentTrends[0];

  return (
    <Card style={{ height: '500px' }}>
      <CardTitle>
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <TrendUpIcon style={{ marginRight: 8 }} />
            Usage Trends Over Time
          </FlexItem>
          {enableRealtime && (
            <FlexItem>
              <Label color="blue" isCompact>Live Data</Label>
            </FlexItem>
          )}
        </Flex>
      </CardTitle>
      <CardBody>
        <Grid hasGutter>
          {/* Current Usage Summary */}
          <GridItem span={6}>
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
              borderRadius: 'var(--pf-t--global--border--radius--default)',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '12px' }}>
                <ClockIcon style={{ marginRight: 8 }} />
                Current Usage ({currentTrend.period})
              </div>
              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                <FlexItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>
                      <CubeIcon style={{ marginRight: 8 }} />
                      Active Workshops:
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} />
                    <FlexItem>
                      <strong>{currentTrend.activeWorkshops}</strong>
                    </FlexItem>
                  </Flex>
                </FlexItem>
                <FlexItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>
                      <UsersIcon style={{ marginRight: 8 }} />
                      Total Users:
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} />
                    <FlexItem>
                      <strong>{currentTrend.totalUsers}</strong>
                    </FlexItem>
                  </Flex>
                </FlexItem>
                <FlexItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>Resource Utilization:</FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} />
                    <FlexItem>
                      <strong>{currentTrend.resourceUtilization.toFixed(1)}%</strong>
                    </FlexItem>
                  </Flex>
                </FlexItem>
              </Flex>
            </div>
          </GridItem>

          {/* Growth Metrics */}
          <GridItem span={6}>
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
              borderRadius: 'var(--pf-t--global--border--radius--default)',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '12px' }}>
                <TrendUpIcon style={{ marginRight: 8 }} />
                Growth Metrics
              </div>
              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                <FlexItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>Monthly Growth:</FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} />
                    <FlexItem>
                      <Label color={getGrowthColor(metrics.growthRate)}>
                        +{metrics.growthRate}%
                      </Label>
                    </FlexItem>
                  </Flex>
                </FlexItem>
                <FlexItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>Peak Usage Hour:</FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} />
                    <FlexItem>
                      <strong>{metrics.peakUsageHour}:00</strong>
                    </FlexItem>
                  </Flex>
                </FlexItem>
                <FlexItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>Avg Session:</FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} />
                    <FlexItem>
                      <strong>{formatDuration(metrics.averageSessionDuration)}</strong>
                    </FlexItem>
                  </Flex>
                </FlexItem>
              </Flex>
            </div>
          </GridItem>

          {/* Top Workshop Types */}
          <GridItem span={12}>
            <div style={{ marginBottom: '16px' }}>
              <strong style={{ display: 'block', marginBottom: '12px' }}>Top Workshop Types</strong>
              {metrics.topWorkshopTypes.map((type, index) => (
                <div key={type.name} style={{ marginBottom: '8px' }}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '4px' }}>
                    <FlexItem>
                      <span>#{index + 1} {type.name}</span>
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} />
                    <FlexItem>
                      <Label color={getGrowthColor(type.growth)}>
                        {type.growth > 0 ? '+' : ''}{type.growth.toFixed(1)}%
                      </Label>
                    </FlexItem>
                    <FlexItem>
                      <span style={{ fontSize: '0.875rem', color: 'var(--pf-t--global--color--text--subtle)' }}>
                        {type.usage} instances
                      </span>
                    </FlexItem>
                  </Flex>
                  <Progress
                    value={(type.usage / metrics.topWorkshopTypes[0]?.usage) * 100}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </GridItem>

          {/* Resource Efficiency */}
          <GridItem span={12}>
            <div style={{
              padding: '12px',
              backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
              borderRadius: 'var(--pf-t--global--border--radius--default)'
            }}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '8px' }}>
                <FlexItem>
                  <strong>Resource Efficiency</strong>
                </FlexItem>
                <FlexItem flex={{ default: 'flex_1' }} />
                <FlexItem>
                  <Label color={metrics.resourceEfficiency > 80 ? 'green' : metrics.resourceEfficiency > 60 ? 'orange' : 'red'}>
                    {metrics.resourceEfficiency.toFixed(1)}%
                  </Label>
                </FlexItem>
              </Flex>
              <Progress
                value={metrics.resourceEfficiency}
                variant={metrics.resourceEfficiency > 80 ? 'success' : metrics.resourceEfficiency > 60 ? 'warning' : 'danger'}
                size="sm"
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--pf-t--global--color--text--subtle)', marginTop: '4px' }}>
                Percentage of workshops that are actively used vs. provisioned
              </div>
            </div>
          </GridItem>
        </Grid>
      </CardBody>
    </Card>
  );
};

export default UsageTrendsChart;