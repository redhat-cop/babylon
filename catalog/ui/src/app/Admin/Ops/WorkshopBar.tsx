import React, { useCallback } from 'react';
import { Checkbox, Tooltip } from '@patternfly/react-core';
import { Workshop } from '@app/types';
import WorkshopStatus from '@app/Workshops/WorkshopStatus';

export interface WorkshopBarProps {
  workshop: Workshop;
  viewStart: Date;
  viewEnd: Date;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onClick: (id: string) => void;
}

function getWorkshopStatus(workshop: Workshop): 'Running' | 'Failed' | 'Upcoming' | 'Stopped' {
  const status = workshop.status;
  if (!status) return 'Upcoming';

  // Check for failed state
  if (status.phase === 'Failed' || status.conditions?.some((c: any) => c.type === 'Failed' && c.status === 'True')) {
    return 'Failed';
  }

  // Check for running state
  if (status.phase === 'Running' || status.phase === 'Active') {
    return 'Running';
  }

  // Check for stopped state
  if (status.phase === 'Stopped' || status.phase === 'Terminated') {
    return 'Stopped';
  }

  // Default to upcoming
  return 'Upcoming';
}

function getStatusColor(status: 'Running' | 'Failed' | 'Upcoming' | 'Stopped'): string {
  switch (status) {
    case 'Running':
      return 'var(--pf-v5-global--success-color--100)';
    case 'Failed':
      return 'var(--pf-v5-global--danger-color--100)';
    case 'Upcoming':
      return 'var(--pf-v5-global--primary-color--100)';
    case 'Stopped':
      return 'var(--pf-v5-global--Color--200)';
  }
}

function getWorkshopDates(workshop: Workshop): { start: Date; end: Date } {
  const spec = workshop.spec;
  const lifespan = spec?.lifespan;

  let start = new Date();
  let end = new Date();
  end.setDate(end.getDate() + 7); // Default to 7 days from now

  if (lifespan?.start) {
    start = new Date(lifespan.start);
  }

  if (lifespan?.end) {
    end = new Date(lifespan.end);
  }

  return { start, end };
}

export const WorkshopBar: React.FC<WorkshopBarProps> = ({
  workshop,
  viewStart,
  viewEnd,
  isSelected,
  onSelect,
  onClick,
}) => {
  const { start: workshopStart, end: workshopEnd } = getWorkshopDates(workshop);
  const status = getWorkshopStatus(workshop);
  const color = getStatusColor(status);

  // Calculate position and width
  const totalViewDays = (viewEnd.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24);
  const clippedStart = new Date(Math.max(workshopStart.getTime(), viewStart.getTime()));
  const clippedEnd = new Date(Math.min(workshopEnd.getTime(), viewEnd.getTime()));
  const daysFromViewStart = (clippedStart.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24);
  const workshopDurationDays = (clippedEnd.getTime() - clippedStart.getTime()) / (1000 * 60 * 60 * 24);

  const leftPercent = (daysFromViewStart / totalViewDays) * 100;
  const widthPercent = Math.max((workshopDurationDays / totalViewDays) * 100, 2); // Minimum 2% width

  const handleCheckboxChange = useCallback(
    (checked: boolean) => {
      onSelect(workshop.metadata.name, checked);
    },
    [onSelect, workshop.metadata.name]
  );

  const handleBarClick = useCallback(() => {
    onClick(workshop.metadata.name);
  }, [onClick, workshop.metadata.name]);

  const workshopName = workshop.spec?.displayName || workshop.metadata.name;

  const tooltipContent = (
    <div>
      <div><strong>{workshopName}</strong></div>
      <div>Status: {status}</div>
      <div>Start: {workshopStart.toLocaleDateString()}</div>
      <div>End: {workshopEnd.toLocaleDateString()}</div>
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <div
        className={`workshop-bar workshop-bar-${status.toLowerCase()}${isSelected ? ' workshop-bar-selected' : ''}`}
        style={{
          position: 'absolute',
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          backgroundColor: color,
          height: '32px',
          borderRadius: '4px',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          boxShadow: isSelected
            ? '0 0 0 2px var(--pf-v5-global--primary-color--100)'
            : '0 1px 2px rgba(0,0,0,0.1)',
          border: isSelected ? '2px solid var(--pf-v5-global--primary-color--100)' : 'none',
          transition: 'box-shadow 0.2s',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
        onClick={handleBarClick}
      >
        <Checkbox
          id={`workshop-bar-checkbox-${workshop.metadata.name}`}
          isChecked={isSelected}
          onChange={(_event, checked) => handleCheckboxChange(checked)}
          onClick={(e) => e.stopPropagation()}
          style={{ marginRight: '8px' }}
          aria-label={`Select ${workshopName}`}
        />
        <span
          style={{
            color: 'white',
            fontSize: '12px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {workshopName}
        </span>
      </div>
    </Tooltip>
  );
};

export default WorkshopBar;
