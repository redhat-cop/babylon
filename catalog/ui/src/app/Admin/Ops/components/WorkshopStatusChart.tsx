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
  Label,
  Badge
} from '@patternfly/react-core';
import {
  ChartPieIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  PauseCircleIcon,
  TimesCircleIcon
} from '@patternfly/react-icons';
import { Workshop } from '@app/types';

interface WorkshopStatusChartProps {
  workshops: Workshop[];
}

interface StatusCounts {
  running: number;
  provisioning: number;
  failed: number;
  stopped: number;
  destroying: number;
  unknown: number;
}

interface StatusInfo {
  count: number;
  percentage: number;
  color: string;
  icon: React.ComponentType<any>;
  label: string;
}

const WorkshopStatusChart: React.FC<WorkshopStatusChartProps> = ({ workshops }) => {
  const statusData = useMemo(() => {
    if (!workshops?.length) {
      return {
        counts: { running: 0, provisioning: 0, failed: 0, stopped: 0, destroying: 0, unknown: 0 },
        total: 0,
        statusInfo: {}
      };
    }

    const counts: StatusCounts = workshops.reduce((acc, workshop) => {
      const state = workshop.status?.summary?.provision?.state;
      const isDisabled = workshop.spec?.provisionDisabled;

      if (isDisabled) {
        acc.stopped++;
      } else if (state === 'failed') {
        acc.failed++;
      } else if (state === 'successful' || state === 'active') {
        acc.running++;
      } else if (state === 'provisioning' || state === 'in-progress') {
        acc.provisioning++;
      } else if (state === 'destroying') {
        acc.destroying++;
      } else {
        acc.unknown++;
      }

      return acc;
    }, { running: 0, provisioning: 0, failed: 0, stopped: 0, destroying: 0, unknown: 0 });

    const total = workshops.length;

    const statusInfo: { [key: string]: StatusInfo } = {
      running: {
        count: counts.running,
        percentage: total > 0 ? (counts.running / total) * 100 : 0,
        color: 'green',
        icon: CheckCircleIcon,
        label: 'Running'
      },
      provisioning: {
        count: counts.provisioning,
        percentage: total > 0 ? (counts.provisioning / total) * 100 : 0,
        color: 'blue',
        icon: InProgressIcon,
        label: 'Provisioning'
      },
      failed: {
        count: counts.failed,
        percentage: total > 0 ? (counts.failed / total) * 100 : 0,
        color: 'red',
        icon: ExclamationCircleIcon,
        label: 'Failed'
      },
      stopped: {
        count: counts.stopped,
        percentage: total > 0 ? (counts.stopped / total) * 100 : 0,
        color: 'orange',
        icon: PauseCircleIcon,
        label: 'Stopped'
      },
      destroying: {
        count: counts.destroying,
        percentage: total > 0 ? (counts.destroying / total) * 100 : 0,
        color: 'purple',
        icon: TimesCircleIcon,
        label: 'Destroying'
      },
      unknown: {
        count: counts.unknown,
        percentage: total > 0 ? (counts.unknown / total) * 100 : 0,
        color: 'grey',
        icon: ChartPieIcon,
        label: 'Unknown'
      }
    };

    return { counts, total, statusInfo };
  }, [workshops]);

  if (statusData.total === 0) {
    return (
      <Card style={{ height: '300px' }}>
        <CardTitle>Workshop Status Distribution</CardTitle>
        <CardBody>
          <EmptyState>
            <ChartPieIcon />
            <EmptyStateBody>
              No workshops found. Status distribution will appear here once workshops are provisioned.
            </EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  // Filter out statuses with zero count for display
  const activeStatuses = Object.entries(statusData.statusInfo)
    .filter(([_, info]) => info.count > 0)
    .sort(([_, a], [__, b]) => b.count - a.count);

  // Calculate health score
  const healthScore = statusData.total > 0
    ? ((statusData.counts.running / statusData.total) * 100)
    : 100;

  const getHealthColor = (score: number) => {
    if (score >= 85) return 'success';
    if (score >= 70) return 'warning';
    return 'danger';
  };

  return (
    <Card style={{ height: '300px' }}>
      <CardTitle>Workshop Status Distribution</CardTitle>
      <CardBody>
        {/* Health Score */}
        <div style={{ marginBottom: '20px' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '8px' }}>
            <FlexItem>
              <strong>System Health Score</strong>
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }} />
            <FlexItem>
              <Badge color={healthScore >= 85 ? 'green' : healthScore >= 70 ? 'orange' : 'red'}>
                {healthScore.toFixed(1)}%
              </Badge>
            </FlexItem>
          </Flex>
          <Progress
            value={healthScore}
            variant={getHealthColor(healthScore)}
            size="sm"
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--pf-t--global--color--text--subtle)', marginTop: '4px' }}>
            Based on percentage of running workshops
          </div>
        </div>

        {/* Status Breakdown */}
        <div style={{ marginBottom: '12px' }}>
          <strong style={{ display: 'block', marginBottom: '12px' }}>
            Status Breakdown ({statusData.total.toLocaleString()} total)
          </strong>
          {activeStatuses.map(([status, info]) => (
            <div key={status} style={{ marginBottom: '12px' }}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '4px' }}>
                <FlexItem>
                  <info.icon
                    style={{
                      marginRight: 8,
                      color: `var(--pf-t--global--color--${info.color}--default)`
                    }}
                  />
                  {info.label}
                </FlexItem>
                <FlexItem flex={{ default: 'flex_1' }} />
                <FlexItem>
                  <Label color={info.color as any}>
                    {info.count.toLocaleString()} ({info.percentage.toFixed(1)}%)
                  </Label>
                </FlexItem>
              </Flex>
              <Progress
                value={info.percentage}
                variant={
                  info.color === 'green' ? 'success' :
                  info.color === 'red' ? 'danger' :
                  info.color === 'orange' ? 'warning' :
                  'success'
                }
                size="sm"
              />
            </div>
          ))}
        </div>

        {/* Alerts for concerning states */}
        {statusData.counts.failed > 0 && (
          <div style={{
            padding: '8px',
            backgroundColor: 'var(--pf-t--global--color--red--50)',
            borderLeft: '3px solid var(--pf-t--global--color--red--default)',
            borderRadius: 'var(--pf-t--global--border--radius--default)',
            marginTop: '12px',
            fontSize: '0.875rem'
          }}>
            <ExclamationCircleIcon
              style={{
                marginRight: 8,
                color: 'var(--pf-t--global--color--red--default)'
              }}
            />
            <strong>Action Required:</strong> {statusData.counts.failed} workshop(s) have failed and need attention.
          </div>
        )}

        {statusData.counts.provisioning > 5 && (
          <div style={{
            padding: '8px',
            backgroundColor: 'var(--pf-t--global--color--blue--50)',
            borderLeft: '3px solid var(--pf-t--global--color--blue--default)',
            borderRadius: 'var(--pf-t--global--border--radius--default)',
            marginTop: '8px',
            fontSize: '0.875rem'
          }}>
            <InProgressIcon
              style={{
                marginRight: 8,
                color: 'var(--pf-t--global--color--blue--default)'
              }}
            />
            <strong>High Activity:</strong> {statusData.counts.provisioning} workshop(s) are currently provisioning.
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export default WorkshopStatusChart;