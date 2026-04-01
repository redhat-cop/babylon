import moment from 'moment';
import { momentLocalizer } from 'react-big-calendar';
import { Workshop } from '@app/types';
import { displayName } from '@app/util';

export const workshopCalendarLocalizer = momentLocalizer(moment);

export type WorkshopCalendarEvent = {
  title: string;
  start: Date;
  end: Date;
  url: string;
  allDay: boolean;
};

function computeEndFromStart(start: Date, ws: Workshop): Date {
  const lifeEnd = ws.spec?.lifespan?.end ? new Date(ws.spec.lifespan.end) : null;
  const stop = ws.spec?.actionSchedule?.stop ? new Date(ws.spec.actionSchedule.stop) : null;
  const candidates = [lifeEnd, stop].filter(
    (d): d is Date => d !== null && Number.isFinite(d.getTime()) && d.getTime() > start.getTime(),
  );
  if (candidates.length > 0) {
    return candidates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
  }
  return new Date(start.getTime() + 60 * 60 * 1000);
}

/**
 * Operations Workshop Control — any workshop with a start time (action schedule or lifespan).
 */
export function workshopToCalendarEventOps(
  ws: Workshop,
  detailUrl: string,
  showNamespace?: boolean,
): WorkshopCalendarEvent | null {
  const startIso = ws.spec?.actionSchedule?.start || ws.spec?.lifespan?.start;
  if (!startIso) return null;
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return null;

  const base = displayName(ws);
  const title = showNamespace ? `${base} (${ws.metadata.namespace})` : base;
  const end = computeEndFromStart(start, ws);

  return {
    title,
    start,
    end,
    url: detailUrl,
    allDay: false,
  };
}

export function workshopCalendarEventStyleGetter(_event: WorkshopCalendarEvent, start: Date) {
  if (start > new Date()) {
    return {
      style: {
        backgroundColor: '#def3ff',
        color: '#002952',
      },
    };
  }

  return {
    style: {
      backgroundColor: '#f3faf2',
      color: '#1e4f18',
    },
  };
}
