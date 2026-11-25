import type { ResourceClaim } from '@app/types';

import { getProvisionJobUrl } from './provisionJobUrl';

const claim = (provision?: Record<string, unknown> | null, kind = 'AnarchySubject'): ResourceClaim =>
  ({
    status: {
      resources: [
        {
          state: {
            kind,
            status: provision === null ? {} : { towerJobs: { provision } },
          },
        },
      ],
    },
  }) as unknown as ResourceClaim;

describe('getProvisionJobUrl', () => {
  it('returns null when there is no AnarchySubject state', () => {
    expect(getProvisionJobUrl({ status: {} } as ResourceClaim)).toBeNull();
    expect(getProvisionJobUrl(claim({}, 'Workshop'))).toBeNull();
  });

  it('returns null when the provision job is missing', () => {
    expect(getProvisionJobUrl(claim(null))).toBeNull();
    expect(getProvisionJobUrl(claim({ towerHost: 'tower.example.com' }))).toBeNull();
  });

  it('treats a bare scheme or whitespace URL as absent', () => {
    expect(getProvisionJobUrl(claim({ towerJobURL: 'https://' }))).toBeNull();
    expect(getProvisionJobUrl(claim({ towerJobURL: 'https:// ' }))).toBeNull();
    expect(getProvisionJobUrl(claim({ towerJobURL: 'https:///' }))).toBeNull();
    expect(getProvisionJobUrl(claim({ towerJobURL: '   ' }))).toBeNull();
  });

  it('rewrites an untyped job URL to the playbook output route', () => {
    expect(getProvisionJobUrl(claim({ towerJobURL: 'https://tower.example.com/#/jobs/12/' }))).toBe(
      'https://tower.example.com/#/jobs/playbook/12/output',
    );
    expect(getProvisionJobUrl(claim({ towerJobURL: 'https://tower.example.com#/jobs/12' }))).toBe(
      'https://tower.example.com/#/jobs/playbook/12/output',
    );
    expect(getProvisionJobUrl(claim({ towerJobURL: 'https://tower.example.com/#/jobs/12/output' }))).toBe(
      'https://tower.example.com/#/jobs/playbook/12/output',
    );
    expect(getProvisionJobUrl(claim({ towerJobURL: 'https://tower.example.com/#/jobs/12?x=1' }))).toBe(
      'https://tower.example.com/#/jobs/playbook/12/output',
    );
  });

  it('adds a missing scheme but keeps the path', () => {
    expect(getProvisionJobUrl(claim({ towerJobURL: 'tower.example.com/#/jobs/12/' }))).toBe(
      'https://tower.example.com/#/jobs/playbook/12/output',
    );
  });

  it('passes an already-typed URL through untouched', () => {
    const typed = 'https://tower.example.com/#/jobs/playbook/12/output';
    expect(getProvisionJobUrl(claim({ towerJobURL: typed }))).toBe(typed);
    const typedNoOutput = 'https://tower.example.com/#/jobs/command/12/';
    expect(getProvisionJobUrl(claim({ towerJobURL: typedNoOutput }))).toBe(typedNoOutput);
  });

  it('passes an unrecognised URL shape through unchanged', () => {
    const other = 'https://tower.example.com/#/templates/job_template/9';
    expect(getProvisionJobUrl(claim({ towerJobURL: other }))).toBe(other);
  });

  it('builds the route from host and job id when no URL is stored', () => {
    expect(getProvisionJobUrl(claim({ towerHost: 'tower.example.com', deployerJob: 42 }))).toBe(
      'https://tower.example.com/#/jobs/playbook/42/output',
    );
    expect(getProvisionJobUrl(claim({ towerHost: 'tower.example.com/', deployerJob: 42 }))).toBe(
      'https://tower.example.com/#/jobs/playbook/42/output',
    );
    expect(getProvisionJobUrl(claim({ towerHost: 'http://tower.example.com', deployerJob: 42 }))).toBe(
      'http://tower.example.com/#/jobs/playbook/42/output',
    );
  });

  it('returns null when the job id is not a positive integer', () => {
    expect(getProvisionJobUrl(claim({ towerHost: 'tower.example.com', deployerJob: 0 }))).toBeNull();
  });
});
