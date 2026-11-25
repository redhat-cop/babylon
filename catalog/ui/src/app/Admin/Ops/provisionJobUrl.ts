import type { ResourceClaim } from '@app/types';

/** Older rows store `#/jobs/<id>/` with no job type; AAP2 routes playbook jobs as `#/jobs/playbook/<id>/output`. */
const TYPED_JOB = /^#\/jobs\/(?:playbook|command|inventory|project)\/\d+/;
const UNTYPED_JOB = /^#\/jobs\/(\d+)/;
const SCHEME = /^https?:\/\//i;

/** Scheme + host with a non-empty host, or null when the value carries no host. */
function hostPart(raw: string): string | null {
  const value = raw.trim();
  const scheme = SCHEME.exec(value)?.[0] ?? 'https://';
  const rest = value.replace(SCHEME, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return rest ? `${scheme}${rest}` : null;
}

/** Returns a usable URL, or null when the stored value carries no host. */
function normalise(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const rest = value.replace(SCHEME, '').replace(/^\/+/, '');
  if (!rest) return null;
  const url = SCHEME.test(value) ? value : `https://${value}`;
  const hashAt = url.indexOf('#/');
  if (hashAt < 0) return url;
  const host = hostPart(url.slice(0, hashAt));
  if (!host) return null;
  const path = url.slice(hashAt);
  if (TYPED_JOB.test(path)) return `${host}/${path}`;
  const match = UNTYPED_JOB.exec(path);
  if (match) return `${host}/#/jobs/playbook/${match[1]}/output`;
  return `${host}/${path}`;
}

/** AAP2 job link for a failed provision, or null when the row has no job reference. */
export function getProvisionJobUrl(rc: ResourceClaim): string | null {
  const state = rc.status?.resources?.[0]?.state;
  if (!state || state.kind !== 'AnarchySubject') return null;
  const provJob = state.status?.towerJobs?.provision;
  if (!provJob) return null;
  if (provJob.towerJobURL) {
    const normalised = normalise(provJob.towerJobURL);
    if (normalised) return normalised;
  }
  const jobId = provJob.deployerJob;
  if (typeof jobId === 'number' && Number.isInteger(jobId) && jobId > 0) {
    const host = hostPart(provJob.towerHost ?? '');
    if (host) return `${host}/#/jobs/playbook/${jobId}/output`;
  }
  return null;
}
