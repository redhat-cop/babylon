import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Tooltip } from '@patternfly/react-core';
import ExternalLinkAltIcon from '@patternfly/react-icons/dist/js/icons/external-link-alt-icon';
import SyncAltIcon from '@patternfly/react-icons/dist/js/icons/sync-alt-icon';

import { ResourceClaim } from '@app/types';
import { extractShowroomUsersFromClaims, ShowroomUserRow } from './showroomLinksFromClaims';

type ProbeState = 'idle' | 'loading' | 'ok' | 'fail' | 'unknown';

function rowKey(r: ShowroomUserRow): string {
  return `${r.userName}::${r.showroomUrl}`;
}

function mapProbeResult(r: 'ok' | 'fail' | 'unknown'): Exclude<ProbeState, 'idle'> {
  return r === 'ok' ? 'ok' : r === 'fail' ? 'fail' : 'unknown';
}

async function probeUrl(url: string): Promise<'ok' | 'fail' | 'unknown'> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', signal: ctrl.signal });
    window.clearTimeout(timer);
    return res.ok ? 'ok' : 'fail';
  } catch {
    return 'unknown';
  }
}

const StatusDot: React.FC<{ state: ProbeState; label: string }> = ({ state, label }) => {
  if (state === 'loading') {
    return (
      <span
        className="ops-showroom-dot ops-showroom-dot--loading"
        role="status"
        aria-label={`${label} checking`}
      />
    );
  }
  if (state === 'ok') {
    return <span className="ops-showroom-dot ops-showroom-dot--ok" role="status" aria-label={`${label} OK`} />;
  }
  if (state === 'fail') {
    return <span className="ops-showroom-dot ops-showroom-dot--fail" role="status" aria-label={`${label} failed`} />;
  }
  if (state === 'unknown') {
    return (
      <Tooltip content="Unreachable or blocked (e.g. CORS). Open the showroom link in a new tab to verify.">
        <span>
          <span className="ops-showroom-dot ops-showroom-dot--unknown" role="status" aria-label={`${label} unknown`} />
        </span>
      </Tooltip>
    );
  }
  return <span className="ops-showroom-dot ops-showroom-dot--idle" aria-hidden />;
};

type Probes = Record<string, { hz: ProbeState; rz: ProbeState }>;

export const OpsShowroomPanelTable: React.FC<{ resourceClaims: ResourceClaim[] }> = ({ resourceClaims }) => {
  const rows = useMemo(() => extractShowroomUsersFromClaims(resourceClaims), [resourceClaims]);
  const [probes, setProbes] = useState<Probes>({});

  const runAllBoth = useCallback(async () => {
    if (rows.length === 0) return;
    setProbes(prev => {
      const next = { ...prev };
      rows.forEach(r => {
        const k = rowKey(r);
        next[k] = { hz: 'loading', rz: 'loading' };
      });
      return next;
    });
    const results = await Promise.all(
      rows.map(async r => {
        const k = rowKey(r);
        const [h, z] = await Promise.all([probeUrl(r.healthzUrl), probeUrl(r.readyzUrl)]);
        return { k, h: mapProbeResult(h), z: mapProbeResult(z) };
      }),
    );
    setProbes(() => {
      const next: Probes = {};
      results.forEach(({ k, h, z }) => {
        next[k] = { hz: h, rz: z };
      });
      return next;
    });
  }, [rows]);

  const checkAllHealthz = useCallback(async () => {
    if (rows.length === 0) return;
    setProbes(prev => {
      const next = { ...prev };
      rows.forEach(r => {
        const k = rowKey(r);
        const cur = next[k] ?? { hz: 'idle', rz: 'idle' };
        next[k] = { ...cur, hz: 'loading' };
      });
      return next;
    });
    const results = await Promise.all(
      rows.map(async r => {
        const k = rowKey(r);
        const h = await probeUrl(r.healthzUrl);
        return { k, h: mapProbeResult(h) };
      }),
    );
    setProbes(prev => {
      const next = { ...prev };
      results.forEach(({ k, h }) => {
        const cur = next[k] ?? { hz: 'idle', rz: 'idle' };
        next[k] = { ...cur, hz: h };
      });
      return next;
    });
  }, [rows]);

  const checkAllReadyz = useCallback(async () => {
    if (rows.length === 0) return;
    setProbes(prev => {
      const next = { ...prev };
      rows.forEach(r => {
        const k = rowKey(r);
        const cur = next[k] ?? { hz: 'idle', rz: 'idle' };
        next[k] = { ...cur, rz: 'loading' };
      });
      return next;
    });
    const results = await Promise.all(
      rows.map(async r => {
        const k = rowKey(r);
        const z = await probeUrl(r.readyzUrl);
        return { k, z: mapProbeResult(z) };
      }),
    );
    setProbes(prev => {
      const next = { ...prev };
      results.forEach(({ k, z }) => {
        const cur = next[k] ?? { hz: 'idle', rz: 'idle' };
        next[k] = { ...cur, rz: z };
      });
      return next;
    });
  }, [rows]);

  const recheckRowHealthz = useCallback(async (r: ShowroomUserRow) => {
    const k = rowKey(r);
    setProbes(prev => ({
      ...prev,
      [k]: { ...(prev[k] ?? { hz: 'idle', rz: 'idle' }), hz: 'loading' },
    }));
    const h = await probeUrl(r.healthzUrl);
    setProbes(prev => ({
      ...prev,
      [k]: { ...(prev[k] ?? { hz: 'idle', rz: 'idle' }), hz: mapProbeResult(h) },
    }));
  }, []);

  const recheckRowReadyz = useCallback(async (r: ShowroomUserRow) => {
    const k = rowKey(r);
    setProbes(prev => ({
      ...prev,
      [k]: { ...(prev[k] ?? { hz: 'idle', rz: 'idle' }), rz: 'loading' },
    }));
    const z = await probeUrl(r.readyzUrl);
    setProbes(prev => ({
      ...prev,
      [k]: { ...(prev[k] ?? { hz: 'idle', rz: 'idle' }), rz: mapProbeResult(z) },
    }));
  }, []);

  useEffect(() => {
    if (rows.length === 0) {
      setProbes({});
      return;
    }
    runAllBoth();
  }, [rows, runAllBoth]);

  if (rows.length === 0) {
    return (
      <p className="ops-showroom-empty">
        No showroom URLs found in provision data for this workshop. They appear after provisioning populates{' '}
        <code>provision_data.users</code> or <code>labUserInterfaceUrls</code>.
      </p>
    );
  }

  return (
    <table className="pf-v6-c-table pf-m-compact pf-m-grid-md ops-showroom-inner-table" role="grid">
      <thead>
        <tr className="ops-showroom-batch-row">
          <th colSpan={2} className="ops-showroom-batch-label">
            Batch checks
          </th>
          <th>
            <Button variant="secondary" size="sm" onClick={checkAllHealthz}>
              Check healthz
            </Button>
          </th>
          <th>
            <Button variant="secondary" size="sm" onClick={checkAllReadyz}>
              Check readyz
            </Button>
          </th>
          <th aria-hidden />
        </tr>
        <tr>
          <th>User</th>
          <th>Showroom</th>
          <th>/healthz</th>
          <th>/readyz</th>
          <th className="ops-showroom-actions-col">Recheck</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const k = rowKey(r);
          const p = probes[k] ?? { hz: 'idle', rz: 'idle' };
          return (
            <tr key={k}>
              <td>
                <code>{r.userName}</code>
              </td>
              <td>
                <a href={r.showroomUrl} target="_blank" rel="noopener noreferrer" className="ops-ws-link">
                  Showroom <ExternalLinkAltIcon />
                </a>
              </td>
              <td className="ops-showroom-probe-cell">
                <StatusDot state={p.hz} label="/healthz" />
              </td>
              <td className="ops-showroom-probe-cell">
                <StatusDot state={p.rz} label="/readyz" />
              </td>
              <td className="ops-showroom-row-actions">
                <Button
                  variant="link"
                  isInline
                  size="sm"
                  icon={<SyncAltIcon />}
                  iconPosition="right"
                  onClick={() => recheckRowHealthz(r)}
                  aria-label={`Recheck healthz for ${r.userName}`}
                >
                  healthz
                </Button>
                <Button
                  variant="link"
                  isInline
                  size="sm"
                  icon={<SyncAltIcon />}
                  iconPosition="right"
                  onClick={() => recheckRowReadyz(r)}
                  aria-label={`Recheck readyz for ${r.userName}`}
                >
                  readyz
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
