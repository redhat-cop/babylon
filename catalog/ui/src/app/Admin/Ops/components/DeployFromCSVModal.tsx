import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Progress,
  ProgressSize,
  Split,
  SplitItem,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Tooltip,
} from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import InProgressIcon from '@patternfly/react-icons/dist/js/icons/in-progress-icon';
import UploadIcon from '@patternfly/react-icons/dist/js/icons/upload-icon';
import DownloadIcon from '@patternfly/react-icons/dist/js/icons/download-icon';
import { apiFetch } from '@app/api';
import { BABYLON_DOMAIN, DEMO_DOMAIN } from '@app/util';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleRow {
  ciName: string;
  ci: string;
  namespace: string;
  workshopName: string;
  enableWorkshopInterface: boolean;
  password: string;
  activity: string;
  purpose: string;
  provisioningDate: string;
  autoStop: string;
  autoDestroy: string;
  users: number | null;
  instances: number | null;
  concurrency: number | null;
  salesforceIds: string;
  awsRegions: string;
  whiteGlove: boolean;
  redirect: boolean;
}

type RowStatus = 'pending' | 'deploying' | 'success' | 'error';

interface RowResult {
  row: ScheduleRow;
  status: RowStatus;
  workshopName?: string;
  error?: string;
}

// ─── CSV parsing helpers ───────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseBool(val: string, defaultVal = true): boolean {
  if (!val) return defaultVal;
  return !['false', '0', 'no', 'n'].includes(val.toLowerCase());
}

function parseDateField(row: Record<string, string>, headerMap: Record<string, string>, keyword: string): string {
  const key = Object.keys(headerMap).find(k => k.includes(keyword));
  return key ? (row[headerMap[key]] ?? '').trim() : '';
}

function parseScheduleCSV(text: string): { rows: ScheduleRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows'] };

  const rawHeaders = parseCsvLine(lines[0]).map(h => h.replace(/^\uFEFF/, ''));
  const lowerHeaders = rawHeaders.map(h => h.toLowerCase());
  const headerMap: Record<string, string> = {};
  lowerHeaders.forEach((h, i) => { headerMap[h] = rawHeaders[i]; });

  const errors: string[] = [];
  const required = ['ci name', 'ci', 'namespace', 'users', 'enable_workshop_interface', 'password', 'activity', 'purpose'];
  for (const r of required) {
    if (!headerMap[r]) errors.push(`Missing required column: "${r}"`);
  }
  if (!Object.keys(headerMap).some(k => k.includes('provisioning date'))) errors.push('Missing "Provisioning Date" column');
  if (!Object.keys(headerMap).some(k => k.includes('auto-stop'))) errors.push('Missing "Auto-stop" column');
  if (!Object.keys(headerMap).some(k => k.includes('auto-destroy'))) errors.push('Missing "Auto-destroy" column');
  if (errors.length > 0) return { rows: [], errors };

  const rows: ScheduleRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, j) => { row[h] = (vals[j] ?? '').trim(); });

    const get = (key: string) => (row[headerMap[key]] ?? '').trim();
    const ciName = get('ci name');
    const ci = get('ci');
    const namespace = get('namespace');
    if (!ciName || !ci || !namespace) continue;

    const usersStr = get('users');
    const users = usersStr ? (isNaN(Number(usersStr)) ? null : Number(usersStr)) : null;
    const instancesStr = get('instances');
    const instances = instancesStr ? (isNaN(Number(instancesStr)) ? null : Number(instancesStr)) : null;
    const concurrencyStr = get('concurrency');
    const concurrency = concurrencyStr ? (isNaN(Number(concurrencyStr)) ? null : Number(concurrencyStr)) : null;

    const salesforceIds = get('salesforce ids') || get('campaign_id') || '';
    const awsRegions = get('aws_region') || get('aws_regions') || '';

    rows.push({
      ciName,
      ci,
      namespace,
      workshopName: get('workshop name') || ciName,
      enableWorkshopInterface: parseBool(get('enable_workshop_interface'), true),
      password: get('password'),
      activity: get('activity') || 'Admin',
      purpose: get('purpose') || 'QA',
      provisioningDate: parseDateField(row, headerMap, 'provisioning date'),
      autoStop: parseDateField(row, headerMap, 'auto-stop'),
      autoDestroy: parseDateField(row, headerMap, 'auto-destroy'),
      users,
      instances,
      concurrency,
      salesforceIds,
      awsRegions,
      whiteGlove: parseBool(get('white_glove'), true),
      redirect: parseBool(get('redirect'), true),
    });
  }

  return { rows, errors: [] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferCatalogNamespace(ci: string): string {
  const parts = ci.split('.');
  const stage = parts[parts.length - 1];
  if (['prod', 'dev', 'test', 'event'].includes(stage)) {
    return `babylon-catalog-${stage}`;
  }
  return 'babylon-catalog';
}

function toIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const formats = [
    { re: /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/, fn: (m: RegExpMatchArray) => new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00Z`) },
    { re: /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/, fn: (m: RegExpMatchArray) => new Date(`20${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00Z`) },
    { re: /^\d{4}-\d{2}-\d{2}T/, fn: (_m: RegExpMatchArray) => new Date(dateStr) },
    { re: /^\d{4}-\d{2}-\d{2} /, fn: (m: RegExpMatchArray) => new Date(dateStr.replace(' ', 'T') + 'Z') },
  ];
  for (const { re, fn } of formats) {
    const m = dateStr.match(re);
    if (m) {
      const d = fn(m as RegExpMatchArray);
      if (!isNaN(d.getTime())) return d.toISOString().replace('.000Z', 'Z');
    }
  }
  return null;
}

function generateName(base: string): string {
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${safe || 'workshop'}-${suffix}`;
}

function buildSalesforceItems(salesforceIds: string): Array<{ id: string; type: string; required: boolean }> {
  if (!salesforceIds) return [];
  const VALID_TYPES = ['opportunity', 'campaign', 'project', 'cdh'];
  return salesforceIds.split(';').map(part => {
    part = part.trim();
    if (!part) return null;
    if (part.includes(':')) {
      const [type, id] = part.split(':', 2);
      return { id: id.trim(), type: VALID_TYPES.includes(type.trim().toLowerCase()) ? type.trim().toLowerCase() : 'opportunity', required: true };
    }
    return { id: part, type: 'opportunity', required: true };
  }).filter(Boolean) as Array<{ id: string; type: string; required: boolean }>;
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function createWorkshopObject(row: ScheduleRow): Promise<{ kind: string; metadata: { name: string; namespace: string; uid: string } }> {
  const name = generateName(row.workshopName || row.ciName);
  const catalogNamespace = inferCatalogNamespace(row.ci);
  const startIso = toIso(row.provisioningDate);
  const stopIso = toIso(row.autoStop);
  const destroyIso = toIso(row.autoDestroy);
  const isScheduled = startIso ? new Date(startIso).getTime() > Date.now() + 15 * 60 * 1000 : false;
  const salesforceItems = buildSalesforceItems(row.salesforceIds);

  const parameterValues: Record<string, unknown> = { purpose: row.purpose };
  if (row.users !== null && row.users > 0) parameterValues.num_users = row.users;
  if (row.awsRegions) {
    const regions = row.awsRegions.split(',').map(r => r.trim().replace('_', '-')).filter(Boolean);
    if (regions.length === 1) parameterValues.aws_region = regions[0];
  }

  const definition = {
    apiVersion: `${BABYLON_DOMAIN}/v1`,
    kind: 'Workshop',
    metadata: {
      name,
      namespace: row.namespace,
      labels: {
        [`${BABYLON_DOMAIN}/catalogItemName`]: row.ci,
        [`${BABYLON_DOMAIN}/catalogItemNamespace`]: catalogNamespace,
        [`${DEMO_DOMAIN}/white-glove`]: String(row.whiteGlove),
        'rhdp-flow-scheduled': 'true',
      },
      annotations: {
        [`${BABYLON_DOMAIN}/catalogItemDisplayName`]: row.ciName,
        [`${DEMO_DOMAIN}/purpose`]: row.purpose,
        [`${DEMO_DOMAIN}/purpose-activity`]: row.activity,
        [`${DEMO_DOMAIN}/requester`]: row.namespace,
        [`${DEMO_DOMAIN}/orderedBy`]: row.namespace,
        [`${DEMO_DOMAIN}/scheduled`]: isScheduled ? 'true' : 'false',
        ...(salesforceItems.length > 0
          ? { [`${DEMO_DOMAIN}/salesforce-items`]: JSON.stringify(salesforceItems) }
          : {}),
      },
    },
    spec: {
      accessPassword: row.password,
      displayName: row.workshopName || row.ciName,
      openRegistration: true,
      multiuserServices: true,
      ...(startIso || destroyIso ? {
        lifespan: {
          ...(startIso ? { start: startIso } : {}),
          ...(destroyIso ? { end: destroyIso } : {}),
        },
      } : {}),
      actionSchedule: {
        ...(startIso ? { start: startIso } : {}),
        ...(stopIso ? { stop: stopIso } : {}),
      },
      ...(row.redirect ? { labUserInterface: { redirect: true } } : {}),
    },
  };

  const resp = await apiFetch(`/apis/${BABYLON_DOMAIN}/v1/namespaces/${row.namespace}/workshops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(definition),
  });
  return resp.json();
}

async function createWorkshopProvisionObject(
  row: ScheduleRow,
  workshop: { metadata: { name: string; namespace: string; uid: string } },
): Promise<void> {
  const catalogNamespace = inferCatalogNamespace(row.ci);
  const salesforceItems = buildSalesforceItems(row.salesforceIds);

  const parameters: Record<string, unknown> = {
    purpose: row.purpose,
    purpose_activity: row.activity,
    purpose_explanation: null,
    salesforce_items: JSON.stringify(salesforceItems),
  };
  if (row.users !== null && row.users > 0) parameters.num_users = row.users;
  if (row.awsRegions) {
    const regions = row.awsRegions.split(',').map(r => r.trim().replace('_', '-')).filter(Boolean);
    if (regions.length === 1) parameters.aws_region = regions[0];
  }

  const count = row.instances ?? (row.users !== null && row.users > 0 ? null : 1);
  const definition = {
    apiVersion: `${BABYLON_DOMAIN}/v1`,
    kind: 'WorkshopProvision',
    metadata: {
      name: workshop.metadata.name,
      namespace: workshop.metadata.namespace,
      labels: {
        [`${BABYLON_DOMAIN}/catalogItemName`]: row.ci,
        [`${BABYLON_DOMAIN}/catalogItemNamespace`]: catalogNamespace,
        'rhdp-flow-scheduled': 'true',
      },
      annotations: {
        [`${BABYLON_DOMAIN}/category`]: '',
      },
      ownerReferences: [
        {
          apiVersion: `${BABYLON_DOMAIN}/v1`,
          controller: true,
          kind: 'Workshop',
          name: workshop.metadata.name,
          uid: workshop.metadata.uid,
        },
      ],
    },
    spec: {
      catalogItem: {
        name: row.ci,
        namespace: catalogNamespace,
      },
      concurrency: row.concurrency ?? 1,
      ...(count !== null ? { count } : {}),
      parameters,
      workshopName: workshop.metadata.name,
    },
  };

  await apiFetch(`/apis/${BABYLON_DOMAIN}/v1/namespaces/${workshop.metadata.namespace}/workshopprovisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(definition),
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultNamespace?: string;
}

export const DeployFromCSVModal: React.FC<Props> = ({ isOpen, onClose, defaultNamespace }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [done, setDone] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [fileName, setFileName] = useState('');
  const [overrideNamespace, setOverrideNamespace] = useState('');

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows: parsed, errors } = parseScheduleCSV(text);
      setParseErrors(errors);
      setRows(parsed);
      setResults([]);
      setDone(false);
    };
    reader.readAsText(file);
  }, []);

  const handleDeploy = useCallback(async () => {
    if (rows.length === 0) return;
    setDeploying(true);
    setDone(false);

    const initial: RowResult[] = rows.map(r => ({ row: r, status: 'pending' }));
    setResults(initial);

    const updated = [...initial];
    for (let i = 0; i < rows.length; i++) {
      const row = { ...rows[i] };
      if (overrideNamespace) row.namespace = overrideNamespace;

      updated[i] = { ...updated[i], status: 'deploying' };
      setResults([...updated]);

      if (dryRun) {
        await new Promise(r => setTimeout(r, 200));
        updated[i] = { ...updated[i], status: 'success', workshopName: `[dry-run] ${row.workshopName}` };
        setResults([...updated]);
        continue;
      }

      try {
        if (row.enableWorkshopInterface) {
          const workshop = await createWorkshopObject(row);
          await createWorkshopProvisionObject(row, workshop);
          updated[i] = { ...updated[i], status: 'success', workshopName: workshop.metadata.name };
        } else {
          // ResourceClaim-only path (no Workshop UI)
          const name = generateName(row.workshopName || row.ciName);
          const catalogNamespace = inferCatalogNamespace(row.ci);
          const startIso = toIso(row.provisioningDate);
          const stopIso = toIso(row.autoStop);
          const destroyIso = toIso(row.autoDestroy);
          const salesforceItems = buildSalesforceItems(row.salesforceIds);
          const parameterValues: Record<string, unknown> = { purpose: row.purpose };
          if (startIso) parameterValues.start_timestamp = startIso;
          if (stopIso) parameterValues.stop_timestamp = stopIso;
          if (row.users !== null && row.users > 0) parameterValues.num_users = row.users;
          if (row.awsRegions) {
            const regions = row.awsRegions.split(',').map(r => r.trim().replace('_', '-')).filter(Boolean);
            if (regions.length === 1) parameterValues.aws_region = regions[0];
          }

          const rcDef = {
            apiVersion: 'poolboy.gpte.redhat.com/v1',
            kind: 'ResourceClaim',
            metadata: {
              name,
              namespace: row.namespace,
              labels: {
                [`${BABYLON_DOMAIN}/catalogItemName`]: row.ci,
                [`${BABYLON_DOMAIN}/catalogItemNamespace`]: catalogNamespace,
                'rhdp-flow-scheduled': 'true',
                [`${DEMO_DOMAIN}/lock-enabled`]: 'true',
              },
              annotations: {
                [`${BABYLON_DOMAIN}/catalogItemDisplayName`]: row.ciName,
                [`${DEMO_DOMAIN}/purpose`]: row.purpose,
                [`${DEMO_DOMAIN}/purpose-activity`]: row.activity,
                [`${DEMO_DOMAIN}/requester`]: row.namespace,
                [`${DEMO_DOMAIN}/white-glove`]: String(row.whiteGlove),
                ...(salesforceItems.length > 0
                  ? { [`${DEMO_DOMAIN}/salesforce-items`]: JSON.stringify(salesforceItems) }
                  : {}),
                ...(destroyIso ? { [`${DEMO_DOMAIN}/scheduled`]: 'true' } : {}),
              },
            },
            spec: {
              provider: {
                name: 'catalog',
                parameterValues,
              },
              ...(destroyIso ? { lifespan: { end: destroyIso } } : {}),
            },
          };
          await apiFetch(`/apis/poolboy.gpte.redhat.com/v1/namespaces/${row.namespace}/resourceclaims`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rcDef),
          });
          updated[i] = { ...updated[i], status: 'success', workshopName: name };
        }
      } catch (err: any) {
        const msg = err?.statusText ?? err?.message ?? String(err);
        updated[i] = { ...updated[i], status: 'error', error: msg };
      }
      setResults([...updated]);
    }

    setDeploying(false);
    setDone(true);
  }, [rows, dryRun, overrideNamespace]);

  const handleDownloadResults = useCallback(() => {
    if (results.length === 0) return;
    const header = ['CI Name', 'CI', 'Namespace', 'Workshop Name (K8s)', 'Status', 'Error'];
    const csvRows = results.map(r => [
      r.row.ciName, r.row.ci, r.row.namespace, r.workshopName ?? '', r.status, r.error ?? '',
    ]);
    const csv = [header, ...csvRows].map(row =>
      row.map(v => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v).join(',')
    ).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `deploy-results-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const handleClose = () => {
    if (deploying) return;
    setRows([]);
    setResults([]);
    setParseErrors([]);
    setFileName('');
    setDone(false);
    setDryRun(false);
    setOverrideNamespace('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const progress = results.length > 0 ? Math.round((successCount + errorCount) / results.length * 100) : 0;

  const previewRows = rows.slice(0, 8);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="large" aria-labelledby="deploy-csv-title">
      <ModalHeader title="Deploy Workshops from CSV" labelId="deploy-csv-title" />
      <ModalBody style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        {/* File picker */}
        <div style={{ marginBottom: 16 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Split hasGutter style={{ alignItems: 'center' }}>
            <SplitItem>
              <Button
                variant="secondary"
                icon={<UploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                isDisabled={deploying}
              >
                {fileName ? 'Change CSV' : 'Upload RHDP-Flow CSV'}
              </Button>
            </SplitItem>
            {fileName && (
              <SplitItem>
                <code style={{ fontSize: '0.85rem' }}>{fileName}</code>
              </SplitItem>
            )}
          </Split>
          <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--pf-t--global--text--color--subtle)' }}>
            Accepts RHDP-Flow compatible CSV with columns: CI Name, CI, Namespace, Users, Enable_workshop_interface, Password, Activity, Purpose, Provisioning Date (UTC), Auto-stop (UTC), Auto-destroy (UTC)
          </div>
        </div>

        {/* Parse errors */}
        {parseErrors.length > 0 && (
          <Alert variant="danger" title="CSV parse errors" isInline style={{ marginBottom: 12 }}>
            <ul>{parseErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </Alert>
        )}

        {/* Options */}
        {rows.length > 0 && !done && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <Checkbox
              id="dry-run-cb"
              label="Dry-run (simulate only, do not create resources)"
              isChecked={dryRun}
              onChange={(_e, v) => setDryRun(v)}
              isDisabled={deploying}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor="override-ns" style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.88rem' }}>
                Override namespace:
              </label>
              <input
                id="override-ns"
                type="text"
                value={overrideNamespace}
                onChange={e => setOverrideNamespace(e.target.value)}
                placeholder={defaultNamespace ?? 'use CSV value'}
                disabled={deploying}
                style={{
                  border: '1px solid var(--pf-t--global--border--color--default)',
                  borderRadius: 4, padding: '2px 8px', fontSize: '0.88rem', width: 260,
                }}
              />
            </div>
          </div>
        )}

        {/* Preview table */}
        {rows.length > 0 && !deploying && !done && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Preview — {rows.length} row{rows.length !== 1 ? 's' : ''} to deploy:
            </div>
            <div style={{ overflowX: 'auto' }}>
              <Table variant="compact" borders>
                <Thead>
                  <Tr>
                    <Th>CI Name</Th>
                    <Th>CI</Th>
                    <Th>Namespace</Th>
                    <Th>Users</Th>
                    <Th>Workshop UI</Th>
                    <Th>Start</Th>
                    <Th>Stop</Th>
                    <Th>Destroy</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {previewRows.map((r, i) => (
                    <Tr key={i}>
                      <Td>{r.ciName}</Td>
                      <Td><code style={{ fontSize: '0.75rem' }}>{r.ci}</code></Td>
                      <Td><code style={{ fontSize: '0.75rem' }}>{overrideNamespace || r.namespace}</code></Td>
                      <Td>{r.users ?? <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>—</span>}</Td>
                      <Td>{r.enableWorkshopInterface ? '✓' : '✗'}</Td>
                      <Td style={{ fontSize: '0.75rem' }}>{r.provisioningDate || '—'}</Td>
                      <Td style={{ fontSize: '0.75rem' }}>{r.autoStop || '—'}</Td>
                      <Td style={{ fontSize: '0.75rem' }}>{r.autoDestroy || '—'}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
            {rows.length > previewRows.length && (
              <div style={{ fontSize: '0.8rem', color: 'var(--pf-t--global--text--color--subtle)', marginTop: 4 }}>
                … and {rows.length - previewRows.length} more
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        {(deploying || done) && results.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Progress
              value={progress}
              size={ProgressSize.sm}
              style={{ marginBottom: 8 }}
              aria-label="Deploy progress"
            />
            <div style={{ overflowX: 'auto' }}>
              <Table variant="compact" borders>
                <Thead>
                  <Tr>
                    <Th>CI Name</Th>
                    <Th>Namespace</Th>
                    <Th>Workshop Name</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {results.map((r, i) => (
                    <Tr key={i}>
                      <Td>{r.row.ciName}</Td>
                      <Td><code style={{ fontSize: '0.75rem' }}>{overrideNamespace || r.row.namespace}</code></Td>
                      <Td><code style={{ fontSize: '0.75rem' }}>{r.workshopName ?? '—'}</code></Td>
                      <Td>
                        {r.status === 'pending' && <span style={{ color: 'var(--pf-t--global--text--color--subtle)', fontSize: '0.85rem' }}>Pending</span>}
                        {r.status === 'deploying' && (
                          <span style={{ fontSize: '0.85rem' }}>
                            <InProgressIcon style={{ marginRight: 4 }} />Deploying…
                          </span>
                        )}
                        {r.status === 'success' && (
                          <span style={{ color: 'var(--pf-t--global--color--status--success)', fontSize: '0.85rem' }}>
                            <CheckCircleIcon style={{ marginRight: 4 }} />Success{dryRun ? ' (dry-run)' : ''}
                          </span>
                        )}
                        {r.status === 'error' && (
                          <Tooltip content={r.error ?? 'Unknown error'}>
                            <span style={{ color: 'var(--pf-t--global--color--status--danger)', fontSize: '0.85rem' }}>
                              <ExclamationCircleIcon style={{ marginRight: 4 }} />Failed
                            </span>
                          </Tooltip>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </div>
        )}

        {/* Done summary */}
        {done && (
          <Alert
            variant={errorCount === 0 ? 'success' : errorCount === results.length ? 'danger' : 'warning'}
            title={`Deploy complete: ${successCount} succeeded, ${errorCount} failed`}
            isInline
          />
        )}
      </ModalBody>
      <ModalFooter>
        {done && errorCount > 0 && (
          <Button variant="secondary" icon={<DownloadIcon />} onClick={handleDownloadResults}>
            Download Results CSV
          </Button>
        )}
        {!deploying && !done && rows.length > 0 && (
          <Button variant="primary" onClick={handleDeploy} isDisabled={parseErrors.length > 0}>
            {dryRun ? 'Run Dry-Run' : `Deploy ${rows.length} Workshop${rows.length !== 1 ? 's' : ''}`}
          </Button>
        )}
        <Button variant={done ? 'primary' : 'link'} onClick={handleClose} isDisabled={deploying}>
          {done ? 'Close' : 'Cancel'}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
