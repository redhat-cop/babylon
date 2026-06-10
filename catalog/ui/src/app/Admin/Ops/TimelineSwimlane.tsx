import React, { useState, useMemo } from 'react';
import { Badge, Button } from '@patternfly/react-core';
import AngleRightIcon from '@patternfly/react-icons/dist/js/icons/angle-right-icon';
import AngleDownIcon from '@patternfly/react-icons/dist/js/icons/angle-down-icon';
import { Workshop } from '@app/types';
import WorkshopBar from './WorkshopBar';

export interface TimelineSwimlaneProps {
  status: 'Running' | 'Failed' | 'Upcoming' | 'Stopped';
  workshops: Workshop[];
  viewStart: Date;
  viewEnd: Date;
  selectedWorkshops: Set<string>;
  onSelectWorkshop: (id: string, selected: boolean) => void;
  onClickWorkshop: (id: string) => void;
}

interface WorkshopRow {
  workshops: Workshop[];
}

function getWorkshopDates(workshop: Workshop): { start: Date; end: Date } {
  const spec = workshop.spec;
  const lifespan = spec?.lifespan;

  let start = new Date();
  let end = new Date();
  end.setDate(end.getDate() + 7);

  if (lifespan?.start) {
    start = new Date(lifespan.start);
  }

  if (lifespan?.end) {
    end = new Date(lifespan.end);
  }

  return { start, end };
}

function workshopsOverlap(w1: Workshop, w2: Workshop): boolean {
  const { start: s1, end: e1 } = getWorkshopDates(w1);
  const { start: s2, end: e2 } = getWorkshopDates(w2);
  return s1 < e2 && s2 < e1;
}

function arrangeWorkshopsInRows(workshops: Workshop[]): WorkshopRow[] {
  const rows: WorkshopRow[] = [];

  workshops.forEach((workshop) => {
    // Find a row where this workshop doesn't overlap with any existing workshop
    let placed = false;
    for (const row of rows) {
      const hasOverlap = row.workshops.some((w) => workshopsOverlap(w, workshop));
      if (!hasOverlap) {
        row.workshops.push(workshop);
        placed = true;
        break;
      }
    }

    // If no suitable row found, create a new one
    if (!placed) {
      rows.push({ workshops: [workshop] });
    }
  });

  return rows;
}

export const TimelineSwimlane: React.FC<TimelineSwimlaneProps> = ({
  status,
  workshops,
  viewStart,
  viewEnd,
  selectedWorkshops,
  onSelectWorkshop,
  onClickWorkshop,
}) => {
  // Default expansion state: Running and Failed are expanded
  const defaultExpanded = status === 'Running' || status === 'Failed';
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const rows = useMemo(() => arrangeWorkshopsInRows(workshops), [workshops]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="timeline-swimlane">
      <div className="timeline-swimlane-header">
        <Button
          variant="plain"
          onClick={toggleExpanded}
          icon={isExpanded ? <AngleDownIcon /> : <AngleRightIcon />}
          style={{ marginRight: '8px' }}
        >
          <strong style={{ fontSize: '14px' }}>{status}</strong>
          <Badge isRead style={{ marginLeft: '8px' }}>
            {workshops.length}
          </Badge>
        </Button>
      </div>
      {isExpanded && (
        <div
          className="timeline-swimlane-body"
          style={{
            position: 'relative',
            minHeight: '60px',
            height: rows.length > 0 ? `${rows.length * 40 + 20}px` : '60px',
            padding: '10px 0',
          }}
        >
          {rows.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--pf-v5-global--Color--200)',
                padding: '20px',
              }}
            >
              No workshops
            </div>
          ) : (
            rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                style={{
                  position: 'relative',
                  height: '40px',
                }}
              >
                {row.workshops.map((workshop) => (
                  <WorkshopBar
                    key={workshop.metadata.name}
                    workshop={workshop}
                    viewStart={viewStart}
                    viewEnd={viewEnd}
                    isSelected={selectedWorkshops.has(workshop.metadata.name)}
                    onSelect={onSelectWorkshop}
                    onClick={onClickWorkshop}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default TimelineSwimlane;
