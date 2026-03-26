import { useCallback, useState } from 'react';
import { Parser as json2csv } from 'json2csv';
import { Workshop, WorkshopProvision } from '@app/types';
import { OperationHistoryEntry } from '../types/operations';

export interface ExportColumn {
  key: string;
  label: string;
  selected: boolean;
  formatter?: (value: any, row: any) => string;
}

export interface ExportOptions {
  filename: string;
  columns: ExportColumn[];
  includeHeaders: boolean;
  dateFormat: 'iso' | 'local' | 'short';
  filterEmptyRows: boolean;
}

export interface WorkshopExportData {
  workshopName: string;
  namespace: string;
  stage: string;
  status: string;
  createdAt: string;
  seatsTotal: number;
  seatsAssigned: number;
  seatsAvailable: number;
  isLocked: boolean;
  autoStopTime?: string;
  destroyTime?: string;
  cloudProvider?: string;
  cloudRegion?: string;
  failedProvisions: number;
  runningProvisions: number;
  lastActivity: string;
  owner: string;
  catalogItemName?: string;
  serviceName?: string;
}

export interface OperationExportData {
  operationId: string;
  operationType: string;
  performedBy: string;
  performedByEmail: string;
  timestamp: string;
  targetWorkshops: number;
  successful: number;
  failed: number;
  successRate: string;
  executionTime: string;
  templateUsed?: string;
  namespaces: string;
  errors?: string;
  parameters: string;
}

export function useCSVExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Default workshop export columns
  const defaultWorkshopColumns: ExportColumn[] = [
    { key: 'workshopName', label: 'Workshop Name', selected: true },
    { key: 'namespace', label: 'Namespace', selected: true },
    { key: 'stage', label: 'Stage', selected: true },
    { key: 'status', label: 'Status', selected: true },
    { key: 'createdAt', label: 'Created At', selected: true, formatter: (value) => new Date(value).toLocaleString() },
    { key: 'seatsTotal', label: 'Total Seats', selected: true },
    { key: 'seatsAssigned', label: 'Assigned Seats', selected: true },
    { key: 'seatsAvailable', label: 'Available Seats', selected: true },
    { key: 'isLocked', label: 'Locked', selected: false, formatter: (value) => value ? 'Yes' : 'No' },
    { key: 'autoStopTime', label: 'Auto Stop Time', selected: false, formatter: (value) => value ? new Date(value).toLocaleString() : '' },
    { key: 'destroyTime', label: 'Destroy Time', selected: false, formatter: (value) => value ? new Date(value).toLocaleString() : '' },
    { key: 'cloudProvider', label: 'Cloud Provider', selected: false },
    { key: 'cloudRegion', label: 'Cloud Region', selected: false },
    { key: 'failedProvisions', label: 'Failed Provisions', selected: false },
    { key: 'runningProvisions', label: 'Running Provisions', selected: false },
    { key: 'lastActivity', label: 'Last Activity', selected: false, formatter: (value) => new Date(value).toLocaleString() },
    { key: 'owner', label: 'Owner', selected: false },
    { key: 'catalogItemName', label: 'Catalog Item', selected: false },
    { key: 'serviceName', label: 'Service Name', selected: false },
  ];

  // Default operation history export columns
  const defaultOperationColumns: ExportColumn[] = [
    { key: 'operationId', label: 'Operation ID', selected: true },
    { key: 'operationType', label: 'Operation Type', selected: true },
    { key: 'performedBy', label: 'Performed By', selected: true },
    { key: 'performedByEmail', label: 'Email', selected: false },
    { key: 'timestamp', label: 'Timestamp', selected: true, formatter: (value) => new Date(value).toLocaleString() },
    { key: 'targetWorkshops', label: 'Target Workshops', selected: true },
    { key: 'successful', label: 'Successful', selected: true },
    { key: 'failed', label: 'Failed', selected: true },
    { key: 'successRate', label: 'Success Rate', selected: true },
    { key: 'executionTime', label: 'Execution Time', selected: false },
    { key: 'templateUsed', label: 'Template Used', selected: false },
    { key: 'namespaces', label: 'Namespaces', selected: false },
    { key: 'parameters', label: 'Parameters', selected: false },
    { key: 'errors', label: 'Errors', selected: false },
  ];

  const transformWorkshopsToExportData = useCallback((workshops: Workshop[], provisions: WorkshopProvision[]): WorkshopExportData[] => {
    return workshops.map(workshop => {
      const workshopProvisions = provisions.filter(p => p.metadata.labels?.['babylon.gpte.redhat.com/workshop'] === workshop.metadata.name);
      const failedProvisions = workshopProvisions.filter(p =>
        p.status?.summary?.provision?.state === 'failed' ||
        p.status?.summary?.provision?.state === 'error'
      ).length;
      const runningProvisions = workshopProvisions.filter(p =>
        p.status?.summary?.provision?.state === 'running' ||
        p.status?.summary?.provision?.state === 'active'
      ).length;

      const seatsTotal = workshop.spec?.labUserInterface?.userCount || 0;
      const seatsAssigned = workshop.status?.summary?.users?.length || 0;

      return {
        workshopName: workshop.metadata.name,
        namespace: workshop.metadata.namespace || '',
        stage: workshop.metadata.labels?.['babylon.gpte.redhat.com/stage'] || '',
        status: workshop.status?.summary?.provision?.state || 'Unknown',
        createdAt: workshop.metadata.creationTimestamp || '',
        seatsTotal,
        seatsAssigned,
        seatsAvailable: seatsTotal - seatsAssigned,
        isLocked: workshop.metadata.labels?.['demo.redhat.com/lock-enabled'] === 'true',
        autoStopTime: workshop.spec?.actionSchedule?.stop,
        destroyTime: workshop.spec?.lifespan?.end,
        cloudProvider: workshop.spec?.vars?.cloudProvider,
        cloudRegion: workshop.spec?.vars?.cloudRegion,
        failedProvisions,
        runningProvisions,
        lastActivity: workshop.status?.summary?.provision?.lastUpdated || workshop.metadata.creationTimestamp || '',
        owner: workshop.metadata.labels?.['babylon.gpte.redhat.com/user'] || '',
        catalogItemName: workshop.metadata.labels?.['babylon.gpte.redhat.com/catalog-item-name'],
        serviceName: workshop.metadata.labels?.['babylon.gpte.redhat.com/service-name'],
      };
    });
  }, []);

  const transformOperationsToExportData = useCallback((operations: OperationHistoryEntry[]): OperationExportData[] => {
    return operations.map(op => ({
      operationId: op.id,
      operationType: op.operationType,
      performedBy: op.performedBy.displayName || op.performedBy.username,
      performedByEmail: op.performedBy.email,
      timestamp: op.timestamp,
      targetWorkshops: op.results.totalTargets,
      successful: op.results.successful,
      failed: op.results.failed,
      successRate: `${Math.round((op.results.successful / op.results.totalTargets) * 100)}%`,
      executionTime: `${Math.round(op.results.executionTimeMs / 1000)}s`,
      templateUsed: op.templateUsed?.name || '',
      namespaces: op.targetScope.namespaces.join(', '),
      parameters: Object.entries(op.parameters)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${value}`)
        .join('; '),
      errors: op.results.errors?.map(e => `${e.workshopName}: ${e.error}`).join('; ') || '',
    }));
  }, []);

  const exportToCsv = useCallback(async (
    data: any[],
    columns: ExportColumn[],
    options: Partial<ExportOptions> = {}
  ) => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      const selectedColumns = columns.filter(col => col.selected);
      const fields = selectedColumns.map(col => ({
        label: col.label,
        value: (row: any) => {
          const value = row[col.key];
          if (col.formatter) {
            return col.formatter(value, row);
          }
          return value ?? '';
        }
      }));

      setExportProgress(25);

      // Process data in chunks for large datasets
      const chunkSize = 1000;
      let csvContent = '';
      const opts = {
        fields,
        header: options.includeHeaders !== false,
        delimiter: ',',
        quote: '"',
        escape: '"',
      };

      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const parser = new json2csv({
          ...opts,
          header: i === 0 ? opts.header : false, // Only include header for first chunk
        });
        const chunkCsv = parser.parse(chunk);

        csvContent += (i === 0 ? '' : '\n') + chunkCsv;
        setExportProgress(25 + (i / data.length) * 50);
      }

      setExportProgress(75);

      // Create and download file
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = options.filename || `export-${timestamp}.csv`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setExportProgress(100);
      setTimeout(() => setExportProgress(0), 2000);

    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportWorkshops = useCallback(async (
    workshops: Workshop[],
    provisions: WorkshopProvision[],
    columns: ExportColumn[] = defaultWorkshopColumns,
    options: Partial<ExportOptions> = {}
  ) => {
    const exportData = transformWorkshopsToExportData(workshops, provisions);
    const filename = options.filename || `workshops-export-${new Date().toISOString().split('T')[0]}.csv`;

    return exportToCsv(exportData, columns, {
      ...options,
      filename,
    });
  }, [transformWorkshopsToExportData, exportToCsv, defaultWorkshopColumns]);

  const exportOperationHistory = useCallback(async (
    operations: OperationHistoryEntry[],
    columns: ExportColumn[] = defaultOperationColumns,
    options: Partial<ExportOptions> = {}
  ) => {
    const exportData = transformOperationsToExportData(operations);
    const filename = options.filename || `operation-history-${new Date().toISOString().split('T')[0]}.csv`;

    return exportToCsv(exportData, columns, {
      ...options,
      filename,
    });
  }, [transformOperationsToExportData, exportToCsv, defaultOperationColumns]);

  const generateSummaryReport = useCallback(async (
    workshops: Workshop[],
    operations: OperationHistoryEntry[],
    dateRange: { start: Date; end: Date }
  ) => {
    const summaryData = [
      {
        metric: 'Total Workshops',
        value: workshops.length.toString(),
        period: `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`,
      },
      {
        metric: 'Active Workshops',
        value: workshops.filter(w => w.status?.summary?.provision?.state === 'running').length.toString(),
        period: `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`,
      },
      {
        metric: 'Total Operations',
        value: operations.length.toString(),
        period: `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`,
      },
      {
        metric: 'Successful Operations',
        value: operations.filter(op => op.status === 'completed' && op.results.failed === 0).length.toString(),
        period: `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`,
      },
      {
        metric: 'Failed Operations',
        value: operations.filter(op => op.status === 'failed' || op.results.failed > 0).length.toString(),
        period: `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`,
      },
      {
        metric: 'Average Success Rate',
        value: operations.length > 0 ?
          `${Math.round(operations.reduce((sum, op) => sum + (op.results.successful / op.results.totalTargets * 100), 0) / operations.length)}%` :
          '0%',
        period: `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`,
      },
    ];

    const summaryColumns: ExportColumn[] = [
      { key: 'metric', label: 'Metric', selected: true },
      { key: 'value', label: 'Value', selected: true },
      { key: 'period', label: 'Period', selected: true },
    ];

    const filename = `babylon-admin-summary-${new Date().toISOString().split('T')[0]}.csv`;

    return exportToCsv(summaryData, summaryColumns, { filename });
  }, [exportToCsv]);

  return {
    isExporting,
    exportProgress,
    defaultWorkshopColumns,
    defaultOperationColumns,
    exportWorkshops,
    exportOperationHistory,
    generateSummaryReport,
    exportToCsv,
  };
}