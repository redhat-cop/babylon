import React, { useState, useCallback } from 'react';
import {
  Modal,
  ModalBody,
  ModalHeader,
  ModalFooter,
  Button,
  Form,
  FormGroup,
  TextInput,
  Checkbox,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  Progress,
  ProgressSize,
  ProgressMeasureLocation,
  Alert,
  AlertVariant,
  Grid,
  GridItem,
  Card,
  CardBody,
  CardTitle,
  Flex,
  FlexItem,
  Label,
  Divider,
} from '@patternfly/react-core';
import {
  DownloadIcon,
  FileIcon,
  TableIcon,
  ChartLineIcon,
} from '@patternfly/react-icons';
import { useCSVExport, ExportColumn, ExportOptions } from '../hooks/useCSVExport';
import { Workshop, WorkshopProvision } from '@app/types';
import { OperationHistoryEntry } from '../types/operations';

export type ExportType = 'workshops' | 'operations' | 'summary';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportType: ExportType;
  workshops?: Workshop[];
  provisions?: WorkshopProvision[];
  operations?: OperationHistoryEntry[];
  title?: string;
}

const exportTypeConfig = {
  workshops: {
    title: 'Export Workshop Data',
    description: 'Export current workshop data to CSV format',
    icon: <TableIcon />,
    defaultFilename: 'workshops-export',
  },
  operations: {
    title: 'Export Operation History',
    description: 'Export operation audit logs to CSV format',
    icon: <ChartLineIcon />,
    defaultFilename: 'operation-history-export',
  },
  summary: {
    title: 'Generate Summary Report',
    description: 'Generate comprehensive summary report',
    icon: <FileIcon />,
    defaultFilename: 'babylon-admin-summary',
  },
};

export function ExportModal({
  isOpen,
  onClose,
  exportType,
  workshops = [],
  provisions = [],
  operations = [],
  title
}: ExportModalProps) {
  const {
    isExporting,
    exportProgress,
    defaultWorkshopColumns,
    defaultOperationColumns,
    exportWorkshops,
    exportOperationHistory,
    generateSummaryReport,
  } = useCSVExport();

  const [columns, setColumns] = useState<ExportColumn[]>(() => {
    switch (exportType) {
      case 'workshops':
        return [...defaultWorkshopColumns];
      case 'operations':
        return [...defaultOperationColumns];
      default:
        return [];
    }
  });

  const [options, setOptions] = useState<ExportOptions>({
    filename: `${exportTypeConfig[exportType].defaultFilename}-${new Date().toISOString().split('T')[0]}.csv`,
    columns: [],
    includeHeaders: true,
    dateFormat: 'local',
    filterEmptyRows: true,
  });

  const [dateFormatSelectOpen, setDateFormatSelectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = exportTypeConfig[exportType];

  const handleColumnToggle = useCallback((columnKey: string, checked: boolean) => {
    setColumns(prev => prev.map(col =>
      col.key === columnKey ? { ...col, selected: checked } : col
    ));
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    setColumns(prev => prev.map(col => ({ ...col, selected: checked })));
  }, []);

  const handleExport = useCallback(async () => {
    setError(null);

    try {
      const selectedColumns = columns.filter(col => col.selected);
      if (selectedColumns.length === 0) {
        setError('Please select at least one column to export');
        return;
      }

      switch (exportType) {
        case 'workshops':
          await exportWorkshops(workshops, provisions, columns, options);
          break;
        case 'operations':
          await exportOperationHistory(operations, columns, options);
          break;
        case 'summary':
          await generateSummaryReport(
            workshops,
            operations,
            {
              start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
              end: new Date(),
            }
          );
          break;
      }

      // Close modal after successful export
      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }, [exportType, columns, options, workshops, provisions, operations, exportWorkshops, exportOperationHistory, generateSummaryReport, onClose]);

  const selectedCount = columns.filter(col => col.selected).length;
  const totalCount = columns.length;

  return (
    <Modal
      variant="medium"
      title={title || config.title}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="export"
          variant="primary"
          onClick={handleExport}
          isDisabled={isExporting || (exportType !== 'summary' && selectedCount === 0)}
          icon={<DownloadIcon />}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={isExporting}>
          Cancel
        </Button>,
      ]}
    >
      <ModalBody>
        {/* Export Type Info */}
        <Card isPlain>
          <CardBody>
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>{config.icon}</FlexItem>
              <FlexItem flex={{ default: 'flex_1' }}>
                <div>
                  <strong>{config.title}</strong>
                  <div style={{ fontSize: 'small', color: 'var(--pf-t--global--color--text--subtle)' }}>
                    {config.description}
                  </div>
                </div>
              </FlexItem>
            </Flex>
          </CardBody>
        </Card>

        <Divider />

        {/* Progress indicator when exporting */}
        {isExporting && (
          <Card>
            <CardBody>
              <Progress
                value={exportProgress}
                title="Exporting data..."
                size={ProgressSize.lg}
                measureLocation={ProgressMeasureLocation.top}
              />
            </CardBody>
          </Card>
        )}

        {/* Error display */}
        {error && (
          <Alert variant={AlertVariant.danger} title="Export Error" isInline>
            {error}
          </Alert>
        )}

        {/* Export Options */}
        <Form>
          <FormGroup label="Filename" fieldId="filename">
            <TextInput
              id="filename"
              value={options.filename}
              onChange={(_, value) => setOptions(prev => ({ ...prev, filename: value }))}
              placeholder="Enter filename"
            />
          </FormGroup>

          <FormGroup>
            <Checkbox
              id="include-headers"
              label="Include column headers"
              isChecked={options.includeHeaders}
              onChange={(_, checked) => setOptions(prev => ({ ...prev, includeHeaders: checked }))}
            />
          </FormGroup>

          <FormGroup>
            <Checkbox
              id="filter-empty-rows"
              label="Filter empty rows"
              isChecked={options.filterEmptyRows}
              onChange={(_, checked) => setOptions(prev => ({ ...prev, filterEmptyRows: checked }))}
            />
          </FormGroup>

          <FormGroup label="Date Format" fieldId="date-format">
            <Select
              isOpen={dateFormatSelectOpen}
              selected={options.dateFormat}
              onSelect={(_, selection) => {
                setOptions(prev => ({ ...prev, dateFormat: selection as 'iso' | 'local' | 'short' }));
                setDateFormatSelectOpen(false);
              }}
              onOpenChange={setDateFormatSelectOpen}
              toggle={(toggleRef) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={() => setDateFormatSelectOpen(!dateFormatSelectOpen)}
                  isExpanded={dateFormatSelectOpen}
                >
                  {options.dateFormat === 'iso' ? 'ISO (2024-03-26T14:30:00Z)' :
                   options.dateFormat === 'local' ? 'Local (3/26/2024, 2:30:00 PM)' :
                   'Short (3/26/2024)'}
                </MenuToggle>
              )}
            >
              <SelectList>
                <SelectOption value="local">Local (3/26/2024, 2:30:00 PM)</SelectOption>
                <SelectOption value="iso">ISO (2024-03-26T14:30:00Z)</SelectOption>
                <SelectOption value="short">Short (3/26/2024)</SelectOption>
              </SelectList>
            </Select>
          </FormGroup>
        </Form>

        {/* Column Selection (not shown for summary reports) */}
        {exportType !== 'summary' && (
          <>
            <Divider />
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4>Select Columns to Export</h4>
                <div>
                  <Label color="blue">
                    {selectedCount} of {totalCount} selected
                  </Label>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => handleSelectAll(selectedCount !== totalCount)}
                    style={{ marginLeft: 8 }}
                  >
                    {selectedCount === totalCount ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
              </div>

              <Grid hasGutter>
                {columns.map((column) => (
                  <GridItem span={6} key={column.key}>
                    <Checkbox
                      id={`column-${column.key}`}
                      label={column.label}
                      isChecked={column.selected}
                      onChange={(_, checked) => handleColumnToggle(column.key, checked)}
                    />
                  </GridItem>
                ))}
              </Grid>
            </div>
          </>
        )}

        {/* Data Summary */}
        <Divider />
        <Card isPlain>
          <CardTitle>Export Summary</CardTitle>
          <CardBody>
            <Grid hasGutter>
              {exportType === 'workshops' && (
                <>
                  <GridItem span={6}>
                    <strong>Workshops:</strong> {workshops.length}
                  </GridItem>
                  <GridItem span={6}>
                    <strong>Provisions:</strong> {provisions.length}
                  </GridItem>
                </>
              )}
              {exportType === 'operations' && (
                <GridItem span={12}>
                  <strong>Operations:</strong> {operations.length}
                </GridItem>
              )}
              {exportType !== 'summary' && (
                <>
                  <GridItem span={6}>
                    <strong>Selected Columns:</strong> {selectedCount}
                  </GridItem>
                  <GridItem span={6}>
                    <strong>Estimated Size:</strong> {Math.round((
                      exportType === 'workshops' ? workshops.length * selectedCount :
                      operations.length * selectedCount
                    ) * 20 / 1024)}KB
                  </GridItem>
                </>
              )}
            </Grid>
          </CardBody>
        </Card>
      </ModalBody>
    </Modal>
  );
}