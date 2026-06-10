import React, { useState, useMemo, useCallback } from 'react';
import { Badge, Checkbox } from '@patternfly/react-core';
import AngleRightIcon from '@patternfly/react-icons/dist/js/icons/angle-right-icon';
import AngleDownIcon from '@patternfly/react-icons/dist/js/icons/angle-down-icon';
import { Workshop, WorkshopWithResourceClaims, MultiWorkshop } from '@app/types';
import WorkshopBar from './WorkshopBar';

interface ProvisionProgress {
  desired: number;
  claimed: number;
  failed: number;
  concurrency: number;
}

export interface TimelineSwimlaneProps {
  status: 'Running' | 'Failed' | 'Upcoming' | 'Stopped';
  workshops: WorkshopWithResourceClaims[];
  viewStart: Date;
  viewEnd: Date;
  selectedWorkshops: Set<string>;
  onSelectWorkshop: (id: string, selected: boolean) => void;
  onClickWorkshop: (id: string) => void;
  getSeats: (ws: Workshop) => { assigned: number; total: number } | null;
  getProvisionProgress: (ws: Workshop) => ProvisionProgress | null;
  getCurrentCount: (ws: Workshop) => number | null;
  multiWorkshopsByName: Map<string, MultiWorkshop>;
  isMultiNs: boolean;
  timezone: string;
  nowPercent: number | null;
}

interface WorkshopRow {
  workshops: WorkshopWithResourceClaims[];
}

function wsKey(ws: WorkshopWithResourceClaims): string {
  return `${ws.metadata.namespace}/${ws.metadata.name}`;
}

function getWorkshopDates(workshop: WorkshopWithResourceClaims): { start: Date; end: Date } {
  const lifespan = workshop.spec?.lifespan;
  let start = new Date();
  let end = new Date();
  end.setDate(end.getDate() + 7);
  if (lifespan?.start) start = new Date(lifespan.start);
  if (lifespan?.end) end = new Date(lifespan.end);
  return { start, end };
}

function workshopsOverlap(w1: WorkshopWithResourceClaims, w2: WorkshopWithResourceClaims): boolean {
  const { start: s1, end: e1 } = getWorkshopDates(w1);
  const { start: s2, end: e2 } = getWorkshopDates(w2);
  return s1 < e2 && s2 < e1;
}

function arrangeWorkshopsInRows(workshops: WorkshopWithResourceClaims[]): WorkshopRow[] {
  const rows: WorkshopRow[] = [];
  workshops.forEach((workshop) => {
    let placed = false;
    for (const row of rows) {
      if (!row.workshops.some((w) => workshopsOverlap(w, workshop))) {
        row.workshops.push(workshop);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push({ workshops: [workshop] });
  });
  return rows;
}

const STATUS_ICONS: Record<string, string> = {
  Running: '▶',
  Failed: '⚠',
  Upcoming: '⏰',
  Stopped: '⏹',
};

export const TimelineSwimlane: React.FC<TimelineSwimlaneProps> = ({
  status,
  workshops,
  viewStart,
  viewEnd,
  selectedWorkshops,
  onSelectWorkshop,
  onClickWorkshop,
  getSeats,
  getProvisionProgress,
  getCurrentCount,
  multiWorkshopsByName,
  isMultiNs,
  timezone,
  nowPercent,
}) => {
  const defaultExpanded = status === 'Running' || status === 'Failed';
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const rows = useMemo(() => arrangeWorkshopsInRows(workshops), [workshops]);

  const workshopKeys = useMemo(() => workshops.map(ws => wsKey(ws)), [workshops]);

  const allSelected = useMemo(
    () => workshopKeys.length > 0 && workshopKeys.every(k => selectedWorkshops.has(k)),
    [workshopKeys, selectedWorkshops]
  );

  const someSelected = useMemo(
    () => !allSelected && workshopKeys.some(k => selectedWorkshops.has(k)),
    [allSelected, workshopKeys, selectedWorkshops]
  );

  const handleSwimlaneSelect = useCallback((_event: React.FormEvent<HTMLInputElement>, checked: boolean) => {
    workshopKeys.forEach(k => onSelectWorkshop(k, checked));
  }, [workshopKeys, onSelectWorkshop]);

  if (workshops.length === 0) return null;

  return (
    <div className={`tl-swimlane tl-swimlane--${status.toLowerCase()}`}>
      <button
        className="tl-swimlane__header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="tl-swimlane__toggle">
          {isExpanded ? <AngleDownIcon /> : <AngleRightIcon />}
        </span>
        <Checkbox
          id={`tl-swimlane-cb-${status}`}
          isChecked={allSelected ? true : someSelected ? null : false}
          onChange={handleSwimlaneSelect}
          onClick={(e) => e.stopPropagation()}
          className="tl-swimlane__checkbox"
          aria-label={`Select all ${status} workshops`}
        />
        <span className="tl-swimlane__icon">{STATUS_ICONS[status]}</span>
        <strong>{status}</strong>
        <Badge isRead className="tl-swimlane__count">{workshops.length}</Badge>
      </button>

      {isExpanded && (
        <div
          className="tl-swimlane__body"
          style={{ height: rows.length > 0 ? `${rows.length * 46 + 16}px` : '60px' }}
        >
          {nowPercent !== null && (
            <div className="tl-now-line" style={{ left: `${nowPercent}%` }} />
          )}
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="tl-swimlane__row" style={{ top: `${rowIndex * 46 + 8}px` }}>
              {row.workshops.map((workshop) => (
                <WorkshopBar
                  key={`${workshop.metadata.namespace}/${workshop.metadata.name}`}
                  workshop={workshop}
                  viewStart={viewStart}
                  viewEnd={viewEnd}
                  isSelected={selectedWorkshops.has(`${workshop.metadata.namespace}/${workshop.metadata.name}`)}
                  onSelect={onSelectWorkshop}
                  onClick={onClickWorkshop}
                  getSeats={getSeats}
                  getProvisionProgress={getProvisionProgress}
                  getCurrentCount={getCurrentCount}
                  multiWorkshopsByName={multiWorkshopsByName}
                  isMultiNs={isMultiNs}
                  timezone={timezone}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimelineSwimlane;
