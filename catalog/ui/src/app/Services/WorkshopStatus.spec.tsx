import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ResourceClaim } from '@app/types';
import WorkshopStatus, { getWorkshopAggregateStatus } from './WorkshopStatus';

const makeResourceClaim = (state: string, name = `rc-${state}`): ResourceClaim =>
  ({
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourceClaim',
    metadata: { name, namespace: 'test-ns', creationTimestamp: new Date().toISOString() },
    spec: {},
    status: { summary: { state } },
  }) as unknown as ResourceClaim;

const many = (state: string, n: number) => Array.from({ length: n }, (_, i) => makeResourceClaim(state, `${state}-${i}`));

describe('getWorkshopAggregateStatus', () => {
  test('all running shows Running n/n', () => {
    const status = getWorkshopAggregateStatus(many('started', 3));
    expect(status).toMatchObject({ phase: 'running', label: 'Running', count: 3, total: 3 });
  });

  test('partially provisioned is in progress, not running', () => {
    const status = getWorkshopAggregateStatus([...many('started', 4), ...many('provisioning', 6)]);
    expect(status).toMatchObject({ phase: 'in-progress', label: 'Running', count: 4, total: 10 });
    expect(status.segments.find((s) => s.key === 'provisioning')?.count).toBe(6);
  });

  test('counts ordered provisions without ResourceClaim yet as pending', () => {
    const status = getWorkshopAggregateStatus(many('started', 2), 5);
    expect(status).toMatchObject({ phase: 'in-progress', count: 2, total: 5 });
    expect(status.segments.find((s) => s.key === 'pending')?.count).toBe(3);
  });

  test('failed instances degrade the status', () => {
    const status = getWorkshopAggregateStatus([...many('started', 9), makeResourceClaim('provision-failed')]);
    expect(status).toMatchObject({ phase: 'degraded', label: 'Running', count: 9, total: 10 });
  });

  test('nothing running uses the leading in-progress state', () => {
    const status = getWorkshopAggregateStatus([...many('provisioning', 7), ...many('provision-pending', 3)]);
    expect(status).toMatchObject({ phase: 'in-progress', label: 'provisioning', count: 7, total: 10 });
  });

  test('mix of running and stopped is partial', () => {
    const status = getWorkshopAggregateStatus([...many('started', 2), ...many('stopped', 3)]);
    expect(status).toMatchObject({ phase: 'partial', label: 'Running', count: 2, total: 5 });
  });
});

describe('WorkshopStatus', () => {
  test('renders headline, fraction and legend', () => {
    render(<WorkshopStatus resourceClaims={[...many('started', 4), ...many('provisioning', 6)]} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('4/10')).toBeInTheDocument();
    expect(screen.getByText('6 provisioning')).toBeInTheDocument();
    expect(screen.queryByText('4 running')).not.toBeInTheDocument();
  });

  test('single instance falls back to plain service status', () => {
    render(<WorkshopStatus resourceClaims={[makeResourceClaim('started')]} expectedCount={1} />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.queryByText('1/1')).not.toBeInTheDocument();
  });
});
