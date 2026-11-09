import React from 'react';
import { Tooltip } from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import OutlinedCalendarAltIcon from '@patternfly/react-icons/dist/js/icons/outlined-calendar-alt-icon';
import { StatusIcon } from '@app/Services/ServiceStatus';
import type { phaseProps } from '@app/Services/ServiceStatus';

import './status-progress.css';

// 'degraded': some instances failed; 'partial': some running, the rest stopped
export type StatusProgressPhase = phaseProps | 'degraded' | 'partial';
export type StatusSegmentVariant = 'success' | 'success-subtle' | 'info' | 'queued' | 'pending' | 'neutral' | 'danger';

export interface StatusSegment {
  key: string;
  label: string;
  count: number;
  variant: StatusSegmentVariant;
  hideInLegend?: boolean;
}

/**
 * Status with a headline ("Running 4/10"), a segmented bar and a compact legend so a partially
 * ready workshop or lab never looks identical to a fully ready one. With a single segment and
 * no count it renders the status of a single service in the same visual style.
 */
const StatusProgress: React.FC<{
  phase: StatusProgressPhase;
  label: string;
  // Omit to hide the "count/total" pill
  count?: number;
  total: number;
  segments: StatusSegment[];
  errorMessage?: string;
  // Replaces the legend
  caption?: React.ReactNode;
}> = ({ phase, label, count, total, segments, errorMessage, caption }) => {
  const visibleSegments = segments.filter((s) => s.count > 0);
  const legend = visibleSegments.filter((s) => !s.hideInLegend);
  const summary = visibleSegments.map((s) => `${s.count} ${s.label}`).join(', ');
  const bar = visibleSegments.map((s) => (
    <span
      key={s.key}
      className={`status-progress__segment status-progress__segment--${s.variant}`}
      style={{ flexGrow: s.count }}
    />
  ));

  return (
    <div className={`status-progress status-progress--${phase}`}>
      <span className="status-progress__headline">
        {phase === 'degraded' ? (
          <ExclamationTriangleIcon />
        ) : phase === 'partial' ? (
          <CheckCircleIcon />
        ) : phase === 'scheduled' ? (
          <OutlinedCalendarAltIcon />
        ) : (
          <StatusIcon phase={phase} />
        )}
        <span className="status-progress__label">{label}</span>
        {count !== undefined ? (
          <span className="status-progress__count">
            {count}/{total}
          </span>
        ) : null}
        {errorMessage ? (
          <Tooltip position="right" content={errorMessage}>
            <ExclamationTriangleIcon aria-label="Error message" className="tooltip-icon-only" />
          </Tooltip>
        ) : null}
      </span>
      {total > 1 ? (
        <Tooltip
          position="bottom"
          content={
            <ul className="status-progress__tooltip">
              {visibleSegments.map((s) => (
                <li key={s.key}>
                  <span className={`status-progress__swatch status-progress__swatch--${s.variant}`} />
                  <b>{s.count}</b> {s.label}
                </li>
              ))}
            </ul>
          }
        >
          <div
            className="status-progress__bar"
            role="img"
            aria-label={`${count ?? total} of ${total} ${label.toLowerCase()}: ${summary}`}
            tabIndex={0}
          >
            {bar}
          </div>
        </Tooltip>
      ) : (
        // Single entity: the headline already says it all
        <div className="status-progress__bar" aria-hidden="true">
          {bar}
        </div>
      )}
      {caption ? (
        <span className="status-progress__legend">{caption}</span>
      ) : legend.length > 0 ? (
        <span className="status-progress__legend">
          {legend.map((s) => (
            <span key={s.key} className="status-progress__legend-item">
              <span className={`status-progress__swatch status-progress__swatch--${s.variant}`} />
              {s.count} {s.label}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
};

export default StatusProgress;
