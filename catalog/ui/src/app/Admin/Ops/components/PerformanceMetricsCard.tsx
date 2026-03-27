import React from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Progress,
  Flex,
  FlexItem,
  Label
} from '@patternfly/react-core';
import {
  TachometerAltIcon,
  UsersIcon,
  ServerIcon,
  ClockIcon
} from '@patternfly/react-icons';

interface PerformanceMetricsCardProps {
  avgResponseTime: number; // in milliseconds
  resourceUtilization: number; // percentage
  totalUsers: number;
}

const PerformanceMetricsCard: React.FC<PerformanceMetricsCardProps> = ({
  avgResponseTime,
  resourceUtilization,
  totalUsers
}) => {
  const getResponseTimeColor = (time: number) => {
    if (time < 200) return 'green';
    if (time < 500) return 'orange';
    return 'red';
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization < 70) return 'green';
    if (utilization < 85) return 'orange';
    return 'red';
  };

  const formatResponseTime = (time: number) => {
    if (time < 1000) return `${time}ms`;
    return `${(time / 1000).toFixed(1)}s`;
  };

  const getPerformanceGrade = () => {
    const responseScore = avgResponseTime < 200 ? 100 : avgResponseTime < 500 ? 75 : avgResponseTime < 1000 ? 50 : 25;
    const utilizationScore = resourceUtilization < 70 ? 100 : resourceUtilization < 85 ? 75 : 50;
    const overall = (responseScore + utilizationScore) / 2;

    if (overall >= 90) return { grade: 'A+', color: 'green' };
    if (overall >= 80) return { grade: 'A', color: 'green' };
    if (overall >= 70) return { grade: 'B+', color: 'blue' };
    if (overall >= 60) return { grade: 'B', color: 'orange' };
    if (overall >= 50) return { grade: 'C', color: 'orange' };
    return { grade: 'D', color: 'red' };
  };

  const performance = getPerformanceGrade();

  return (
    <Card style={{ height: '300px' }}>
      <CardTitle>Performance Metrics</CardTitle>
      <CardBody>
        {/* Performance Grade */}
        <div style={{
          textAlign: 'center',
          padding: '16px',
          backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
          borderRadius: 'var(--pf-t--global--border--radius--default)',
          marginBottom: '20px'
        }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
            <Label color={performance.color as any} style={{ fontSize: '2rem', padding: '8px 16px' }}>
              {performance.grade}
            </Label>
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--pf-t--global--color--text--subtle)' }}>
            Overall Performance Score
          </div>
        </div>

        {/* Response Time */}
        <div style={{ marginBottom: '16px' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '4px' }}>
            <FlexItem>
              <ClockIcon style={{ marginRight: 8 }} />
              Avg Response Time
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }} />
            <FlexItem>
              <Label color={getResponseTimeColor(avgResponseTime) as any}>
                {formatResponseTime(avgResponseTime)}
              </Label>
            </FlexItem>
          </Flex>
          <Progress
            value={Math.max(0, 100 - (avgResponseTime / 10))} // Convert to percentage (lower is better)
            variant={
              avgResponseTime < 200 ? 'success' :
              avgResponseTime < 500 ? 'warning' : 'danger'
            }
            size="sm"
          />
        </div>

        {/* Resource Utilization */}
        <div style={{ marginBottom: '16px' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: '4px' }}>
            <FlexItem>
              <ServerIcon style={{ marginRight: 8 }} />
              Resource Utilization
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }} />
            <FlexItem>
              <Label color={getUtilizationColor(resourceUtilization) as any}>
                {resourceUtilization.toFixed(1)}%
              </Label>
            </FlexItem>
          </Flex>
          <Progress
            value={resourceUtilization}
            variant={
              resourceUtilization < 70 ? 'success' :
              resourceUtilization < 85 ? 'warning' : 'danger'
            }
            size="sm"
          />
        </div>

        {/* Active Users */}
        <div style={{ marginBottom: '16px' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <UsersIcon style={{ marginRight: 8 }} />
              Active Users
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }} />
            <FlexItem>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                  {totalUsers.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--pf-t--global--color--text--subtle)' }}>
                  currently active
                </div>
              </div>
            </FlexItem>
          </Flex>
        </div>

        {/* Performance Tips */}
        <div style={{
          padding: '8px',
          backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
          borderRadius: 'var(--pf-t--global--border--radius--default)',
          fontSize: '0.75rem',
          marginTop: '16px'
        }}>
          <TachometerAltIcon style={{ marginRight: 8 }} />
          <strong>Performance Tips:</strong>
          {avgResponseTime > 500 && (
            <span style={{ color: 'var(--pf-t--global--color--red--default)' }}>
              {' '}High response time detected. Consider scaling resources.
            </span>
          )}
          {resourceUtilization > 85 && (
            <span style={{ color: 'var(--pf-t--global--color--red--default)' }}>
              {' '}High resource utilization. Monitor for potential bottlenecks.
            </span>
          )}
          {avgResponseTime <= 200 && resourceUtilization <= 70 && (
            <span style={{ color: 'var(--pf-t--global--color--green--default)' }}>
              {' '}System is performing optimally.
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

export default PerformanceMetricsCard;