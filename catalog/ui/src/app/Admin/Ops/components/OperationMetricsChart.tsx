import React, { useMemo } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  Progress,
  Flex,
  FlexItem,
  Label
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InfoCircleIcon,
  ChartLineIcon
} from '@patternfly/react-icons';

interface OperationMetricsChartProps {
  operationHistory: any[];
  enableRealtime?: boolean;
}

interface OperationMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  successRate: number;
  operationTypes: { [key: string]: { success: number; failed: number; rate: number } };
  recentTrend: 'improving' | 'declining' | 'stable';
}

const OperationMetricsChart: React.FC<OperationMetricsChartProps> = ({
  operationHistory,
  enableRealtime = false
}) => {
  const metrics: OperationMetrics = useMemo(() => {
    if (!operationHistory?.length) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        successRate: 100,
        operationTypes: {},
        recentTrend: 'stable'
      };
    }

    const totalOperations = operationHistory.length;
    const successfulOperations = operationHistory.filter(op => op.status === 'success').length;
    const failedOperations = totalOperations - successfulOperations;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 100;

    // Group by operation types
    const operationTypes = operationHistory.reduce((acc, op) => {
      const type = op.operationType || 'unknown';
      if (!acc[type]) {
        acc[type] = { success: 0, failed: 0, rate: 0 };
      }

      if (op.status === 'success') {
        acc[type].success++;
      } else {
        acc[type].failed++;
      }

      const total = acc[type].success + acc[type].failed;
      acc[type].rate = total > 0 ? (acc[type].success / total) * 100 : 100;

      return acc;
    }, {} as { [key: string]: { success: number; failed: number; rate: number } });

    // Calculate recent trend (last 10 operations vs previous 10)
    let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (operationHistory.length >= 20) {
      const recent = operationHistory.slice(-10);
      const previous = operationHistory.slice(-20, -10);

      const recentSuccessRate = (recent.filter(op => op.status === 'success').length / recent.length) * 100;
      const previousSuccessRate = (previous.filter(op => op.status === 'success').length / previous.length) * 100;

      if (recentSuccessRate > previousSuccessRate + 5) {
        recentTrend = 'improving';
      } else if (recentSuccessRate < previousSuccessRate - 5) {
        recentTrend = 'declining';
      }
    }

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      successRate,
      operationTypes,
      recentTrend
    };
  }, [operationHistory]);

  if (metrics.totalOperations === 0) {
    return (
      <Card style={{ height: '400px' }}>
        <CardTitle>Operation Success Rates</CardTitle>
        <CardBody>
          <EmptyState>
            <ChartLineIcon />
            <EmptyStateBody>
              No operation data available. Operations will appear here once you start managing workshops.
            </EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving': return 'green';
      case 'declining': return 'red';
      default: return 'blue';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return CheckCircleIcon;
      case 'declining': return ExclamationCircleIcon;
      default: return InfoCircleIcon;
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'green';
    if (rate >= 85) return 'orange';
    return 'red';
  };

  return (
    <Card style={{ height: '400px' }}>
      <CardTitle>
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>Operation Success Rates</FlexItem>
          {enableRealtime && (
            <FlexItem>
              <Label color="blue" isCompact>Live</Label>
            </FlexItem>
          )}
        </Flex>
      </CardTitle>
      <CardBody>
        {/* Overall Success Rate */}
        <div style={{ marginBottom: '24px' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '8px' }}>
            <FlexItem>
              <strong>Overall Success Rate</strong>
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }} />
            <FlexItem>
              <Label color={getSuccessRateColor(metrics.successRate)}>
                {metrics.successRate.toFixed(1)}%
              </Label>
            </FlexItem>
            <FlexItem>
              <Label color={getTrendColor(metrics.recentTrend)}>
                {metrics.recentTrend}
              </Label>
            </FlexItem>
          </Flex>
          <Progress
            value={metrics.successRate}
            variant={metrics.successRate >= 95 ? 'success' : metrics.successRate >= 85 ? 'warning' : 'danger'}
            size="lg"
          />
          <div style={{ fontSize: '0.875rem', color: 'var(--pf-t--global--color--text--subtle)', marginTop: '4px' }}>
            {metrics.successfulOperations.toLocaleString()} successful, {metrics.failedOperations.toLocaleString()} failed
            out of {metrics.totalOperations.toLocaleString()} total operations
          </div>
        </div>

        {/* Operation Types Breakdown */}
        <div style={{ marginBottom: '16px' }}>
          <strong style={{ display: 'block', marginBottom: '12px' }}>Success Rate by Operation Type</strong>
          {Object.entries(metrics.operationTypes).map(([type, data]) => (
            <div key={type} style={{ marginBottom: '12px' }}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '4px' }}>
                <FlexItem>
                  <span style={{ textTransform: 'capitalize' }}>{type}</span>
                </FlexItem>
                <FlexItem flex={{ default: 'flex_1' }} />
                <FlexItem>
                  <Label color={getSuccessRateColor(data.rate)}>
                    {data.rate.toFixed(1)}%
                  </Label>
                </FlexItem>
                <FlexItem>
                  <span style={{ fontSize: '0.75rem', color: 'var(--pf-t--global--color--text--subtle)' }}>
                    {data.success + data.failed} ops
                  </span>
                </FlexItem>
              </Flex>
              <Progress
                value={data.rate}
                variant={data.rate >= 95 ? 'success' : data.rate >= 85 ? 'warning' : 'danger'}
                size="sm"
              />
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        <div style={{
          padding: '12px',
          backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
          borderRadius: 'var(--pf-t--global--border--radius--default)',
          marginTop: '16px'
        }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--pf-t--global--color--text--subtle)' }}>
            <strong>Recent Activity:</strong> Most recent operations show a {metrics.recentTrend} trend.
            {metrics.recentTrend === 'declining' && (
              <span style={{ color: 'var(--pf-t--global--color--red--default)' }}>
                {' '}Consider investigating failed operations.
              </span>
            )}
            {metrics.recentTrend === 'improving' && (
              <span style={{ color: 'var(--pf-t--global--color--green--default)' }}>
                {' '}System performance is improving.
              </span>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

export default OperationMetricsChart;