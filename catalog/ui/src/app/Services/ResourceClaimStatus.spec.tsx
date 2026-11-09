import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ResourceClaim } from '@app/types';
import ResourceClaimStatus from './ResourceClaimStatus';

const makeResourceClaim = (componentStates: (string | null)[], summaryState?: string): ResourceClaim =>
  ({
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourceClaim',
    metadata: { name: 'rc', namespace: 'test-ns', creationTimestamp: new Date().toISOString() },
    spec: { resources: componentStates.map((_, i) => ({ name: `component-${i}`, template: {} })) },
    status: {
      ...(summaryState ? { summary: { state: summaryState } } : {}),
      resources: componentStates.map((state, i) => ({
        name: `component-${i}`,
        ...(state === null
          ? {}
          : { state: { kind: 'AnarchySubject', metadata: { name: `as-${i}` }, spec: { vars: { current_state: state } } } }),
      })),
    },
  }) as unknown as ResourceClaim;

describe('ResourceClaimStatus', () => {
  test('summary says started but tenants are still provisioning', () => {
    render(<ResourceClaimStatus resourceClaim={makeResourceClaim(['started', 'provisioning', 'provisioning'], 'started')} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('2 provisioning')).toBeInTheDocument();
  });

  test('components not created yet count as waiting to provision', () => {
    render(<ResourceClaimStatus resourceClaim={makeResourceClaim(['started', null])} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('1 waiting to provision')).toBeInTheDocument();
  });

  test('all components in the same state show the plain service status', () => {
    render(<ResourceClaimStatus resourceClaim={makeResourceClaim(['started', 'started'], 'started')} />);
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.queryByText('2/2')).not.toBeInTheDocument();
  });

  test('single component shows the plain service status', () => {
    render(<ResourceClaimStatus resourceClaim={makeResourceClaim(['provisioning'], 'provisioning')} />);
    expect(screen.getByText(/provisioning/i)).toBeInTheDocument();
    expect(screen.queryByText('0/1')).not.toBeInTheDocument();
  });

  test('scheduled service shows the scheduled status with start time', () => {
    const resourceClaim = makeResourceClaim(['started']);
    resourceClaim.spec.lifespan = { start: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() };
    resourceClaim.status = undefined;
    render(<ResourceClaimStatus resourceClaim={resourceClaim} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText(/Starts/)).toHaveTextContent('Starts 3 hours from now');
  });
});
