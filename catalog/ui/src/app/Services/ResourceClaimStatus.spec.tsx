import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ResourceClaim } from '@app/types';
import ResourceClaimStatus from './ResourceClaimStatus';

const makeResourceClaim = (componentStates: string[], summaryState?: string): ResourceClaim =>
  ({
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourceClaim',
    metadata: { name: 'rc', namespace: 'test-ns', creationTimestamp: new Date().toISOString() },
    spec: { resources: componentStates.map((_, i) => ({ name: `component-${i}`, template: {} })) },
    status: {
      ...(summaryState ? { summary: { state: summaryState, error_message: summaryState.endsWith('-failed') ? 'Boom' : undefined } } : {}),
      resources: componentStates.map((state, i) => ({
        name: `component-${i}`,
        state: { kind: 'AnarchySubject', metadata: { name: `as-${i}` }, spec: { vars: { current_state: state } } },
      })),
    },
  }) as unknown as ResourceClaim;

describe('ResourceClaimStatus', () => {
  test('shows the service status as a single entity, without component breakdown', () => {
    const { container } = render(
      <ResourceClaimStatus resourceClaim={makeResourceClaim(['started', 'provisioning', 'provisioning'], 'provisioning')} />,
    );
    expect(screen.getByText(/provisioning/i)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText('2 provisioning')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.status-progress__segment')).toHaveLength(1);
    expect(container.querySelector('.status-progress__segment--queued')).toBeInTheDocument();
  });

  test('running service renders a full success bar', () => {
    const { container } = render(<ResourceClaimStatus resourceClaim={makeResourceClaim(['started'], 'started')} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(container.querySelector('.status-progress--running .status-progress__segment--success')).toBeInTheDocument();
  });

  test('failed service keeps the error message tooltip', () => {
    const { container } = render(<ResourceClaimStatus resourceClaim={makeResourceClaim(['provision-failed'], 'provision-failed')} />);
    expect(screen.getByText(/provision failed/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Error message')).toBeInTheDocument();
    expect(container.querySelector('.status-progress__segment--danger')).toBeInTheDocument();
  });

  test('scheduled service shows the scheduled status with start time', () => {
    const resourceClaim = makeResourceClaim(['started']);
    resourceClaim.spec.lifespan = { start: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() };
    resourceClaim.status = undefined;
    render(<ResourceClaimStatus resourceClaim={resourceClaim} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText(/Starts/)).toHaveTextContent('Starts 3 hours from now');
  });

  test.each([
    ['start-pending', /start pending/i],
    ['provision-pending', /provision pending/i],
    ['provisioning', /provisioning/i],
  ])('%s uses the purple queued style', (state, text) => {
    const { container } = render(<ResourceClaimStatus resourceClaim={makeResourceClaim([state], state)} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.querySelector('.status-progress--queued .status-progress__segment--queued')).toBeInTheDocument();
  });
});
