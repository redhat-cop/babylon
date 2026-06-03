import React from 'react';
import { render, screen } from '@testing-library/react';
import SelfPacedLabStatus from './SelfPacedLabStatus';
import { ResourceClaim } from '@app/types';

describe('SelfPacedLabStatus', () => {
  describe('with poolCount prop', () => {
    test('should display ready, assigned, and provisioning counts', () => {
      render(<SelfPacedLabStatus poolCount={{ ready: 5, assigned: 3, provisioning: 2 }} />);

      expect(screen.getByText('5 ready')).toBeInTheDocument();
      expect(screen.getByText('3 assigned')).toBeInTheDocument();
      expect(screen.getByText('2 provisioning')).toBeInTheDocument();
    });

    test('should default missing counts to 0', () => {
      render(<SelfPacedLabStatus poolCount={{}} />);

      expect(screen.getByText('0 ready')).toBeInTheDocument();
      expect(screen.getByText('0 assigned')).toBeInTheDocument();
      expect(screen.getByText('0 provisioning')).toBeInTheDocument();
    });

    test('should handle partial poolCount', () => {
      render(<SelfPacedLabStatus poolCount={{ ready: 3 }} />);

      expect(screen.getByText('3 ready')).toBeInTheDocument();
      expect(screen.getByText('0 assigned')).toBeInTheDocument();
      expect(screen.getByText('0 provisioning')).toBeInTheDocument();
    });
  });

  describe('with resourceClaims prop', () => {
    const assignmentLabel = 'babylon.gpte.redhat.com/assigned';

    const makeResourceClaim = (overrides: {
      labels?: Record<string, string>;
      state?: string;
    }): ResourceClaim =>
      ({
        apiVersion: 'poolboy.gpte.redhat.com/v1',
        kind: 'ResourceClaim',
        metadata: {
          name: 'rc-test',
          namespace: 'test-ns',
          labels: overrides.labels || {},
        },
        status: {
          summary: {
            state: overrides.state || 'provisioning',
          },
        },
      }) as unknown as ResourceClaim;

    test('should count assigned claims by label', () => {
      const resourceClaims = [
        makeResourceClaim({ labels: { [assignmentLabel]: 'user@example.com' }, state: 'started' }),
        makeResourceClaim({ labels: { [assignmentLabel]: 'user2@example.com' }, state: 'started' }),
        makeResourceClaim({ state: 'started' }),
      ];

      render(<SelfPacedLabStatus resourceClaims={resourceClaims} />);

      expect(screen.getByText('1 ready')).toBeInTheDocument();
      expect(screen.getByText('2 assigned')).toBeInTheDocument();
      expect(screen.getByText('0 provisioning')).toBeInTheDocument();
    });

    test('should count ready claims (started/stopped without assignment)', () => {
      const resourceClaims = [
        makeResourceClaim({ state: 'started' }),
        makeResourceClaim({ state: 'stopped' }),
        makeResourceClaim({ state: 'provisioning' }),
      ];

      render(<SelfPacedLabStatus resourceClaims={resourceClaims} />);

      expect(screen.getByText('2 ready')).toBeInTheDocument();
      expect(screen.getByText('0 assigned')).toBeInTheDocument();
      expect(screen.getByText('1 provisioning')).toBeInTheDocument();
    });

    test('should show all zeros with empty resourceClaims', () => {
      render(<SelfPacedLabStatus resourceClaims={[]} />);

      expect(screen.getByText('0 ready')).toBeInTheDocument();
      expect(screen.getByText('0 assigned')).toBeInTheDocument();
      expect(screen.getByText('0 provisioning')).toBeInTheDocument();
    });

    test('should show all zeros when resourceClaims is undefined', () => {
      render(<SelfPacedLabStatus />);

      expect(screen.getByText('0 ready')).toBeInTheDocument();
      expect(screen.getByText('0 assigned')).toBeInTheDocument();
      expect(screen.getByText('0 provisioning')).toBeInTheDocument();
    });
  });

  describe('poolCount takes priority over resourceClaims', () => {
    test('should use poolCount when both props are provided', () => {
      const resourceClaims = [
        {
          apiVersion: 'poolboy.gpte.redhat.com/v1',
          kind: 'ResourceClaim',
          metadata: { name: 'rc-1', namespace: 'ns', labels: {} },
          status: { summary: { state: 'started' } },
        } as unknown as ResourceClaim,
      ];

      render(
        <SelfPacedLabStatus poolCount={{ ready: 10, assigned: 5, provisioning: 3 }} resourceClaims={resourceClaims} />,
      );

      expect(screen.getByText('10 ready')).toBeInTheDocument();
      expect(screen.getByText('5 assigned')).toBeInTheDocument();
      expect(screen.getByText('3 provisioning')).toBeInTheDocument();
    });
  });
});
