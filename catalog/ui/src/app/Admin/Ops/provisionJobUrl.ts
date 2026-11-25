import type { ResourceClaim } from '@app/types';

/** AAP2 routes playbook jobs as `#/jobs/playbook/<id>/output`. */
const TYPED_JOB = /#\/jobs\/(?:playbook|command|inventory|project)\/\d+/;
/** Older rows store `#/jobs/<id>/` with no job type. */
const UNTYPED_JOB = /^(.*?)#\/jobs\/(\d+)(?:[/?].*)?$/;
const SCHEME = /^https?:\/\//i;

function withScheme(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, '');
  return SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Returns a usable URL, or null when the stored value carries no host or id. */
function normalise(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withoutScheme = value.replace(SCHEME, '').replace(/^\/+/, '');
  if (!withoutScheme) return null;
  const url = SCHEME.test(value) ? value : `https://${value}`;
  if (TYPED_JOB.test(url)) return url;
  const match = UNTYPED_JOB.exec(url);
  if (match) {
    const host = match[1].replace(/\/+$/, '');
    return `${host}/#/jobs/playbook/${match[2]}/output`;
  }
  return url;
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
  if (provJob.towerHost && typeof jobId === 'number' && Number.isInteger(jobId) && jobId > 0) {
    return `${withScheme(provJob.towerHost)}/#/jobs/playbook/${jobId}/output`;
  }
  return null;
}
