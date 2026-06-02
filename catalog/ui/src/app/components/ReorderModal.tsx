import React, { useEffect, useMemo, useState } from 'react';
import parseDuration from 'parse-duration';
import {
  Alert,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import CatalogItemFormAutoStopDestroyModal, {
  TDatesTypes,
} from '@app/Catalog/CatalogItemFormAutoStopDestroyModal';
import ReorderScheduleStartModal from '@app/components/ReorderScheduleStartModal';
import { isAutoStopDisabled } from '@app/Catalog/catalog-utils';
import { CatalogItem } from '@app/types';
import {
  getInitialReorderSchedule,
  isValidReorderSchedule,
  parseCatalogDuration,
  ReorderSchedule,
} from '@app/reorder-utils';

type ScheduleModalType = 'start' | TDatesTypes | null;

function getConfirmedStopDate(
  stopDate: Date | undefined,
  endDate: Date,
  previousStopDate?: Date,
): Date | undefined {
  const resolvedStopDate = stopDate ?? previousStopDate;
  if (!resolvedStopDate || resolvedStopDate.getTime() >= endDate.getTime()) {
    return undefined;
  }
  return resolvedStopDate;
}

const ReorderModal: React.FC<{
  catalogItem: CatalogItem;
  displayName: string;
  isAdmin: boolean;
  isWorkshop?: boolean;
  schedule: ReorderSchedule;
  onReorder: (schedule: ReorderSchedule) => Promise<void>;
  setOnConfirmCb?: React.Dispatch<React.SetStateAction<() => Promise<void>>>;
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setIsDisabled?: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({
  catalogItem,
  displayName,
  isAdmin,
  isWorkshop = false,
  schedule,
  onReorder,
  setOnConfirmCb,
  setTitle,
  setIsDisabled,
}) => {
  const [scheduleDates, setScheduleDates] = useState<ReorderSchedule>(() =>
    getInitialReorderSchedule(schedule, catalogItem),
  );
  const [scheduleModal, setScheduleModal] = useState<ScheduleModalType>(null);

  const maxAutoDestroyTime = Math.min(
    parseCatalogDuration(catalogItem.spec.lifespan?.maximum) ?? parseDuration('14d'),
    parseCatalogDuration(catalogItem.spec.lifespan?.relativeMaximum) ?? parseDuration('7d'),
  );
  const maxAutoStopTime = parseCatalogDuration(catalogItem.spec.runtime?.maximum);
  const defaultRuntimeTimestamp =
    parseCatalogDuration(catalogItem.spec.runtime?.default) ?? parseDuration('4h');

  const validationMessage = useMemo(() => {
    const now = Date.now();
    if (!scheduleDates.endDate) {
      return 'Destroy date is required.';
    }
    if (scheduleDates.endDate.getTime() <= now) {
      return 'Destroy date must be in the future.';
    }
    if (scheduleDates.stopDate) {
      if (scheduleDates.stopDate.getTime() <= now) {
        return 'Stop date must be in the future.';
      }
      if (scheduleDates.startDate.getTime() >= scheduleDates.stopDate.getTime()) {
        return 'Start date must be before stop date.';
      }
    }
    if (!scheduleDates.startDate) {
      return 'Start date is required.';
    }
    if (scheduleDates.startDate.getTime() >= scheduleDates.endDate.getTime()) {
      return 'Start date must be before destroy date.';
    }
    return null;
  }, [scheduleDates]);

  useEffect(() => {
    setTitle?.('Reorder');
    setOnConfirmCb?.(() => () => onReorder(scheduleDates));
  }, [onReorder, scheduleDates, setOnConfirmCb, setTitle]);

  useEffect(() => {
    setIsDisabled?.(!isValidReorderSchedule(scheduleDates));
  }, [scheduleDates, setIsDisabled]);

  const updateSchedule = (field: keyof ReorderSchedule, date: Date) => {
    setScheduleDates((current) => ({ ...current, [field]: date }));
  };

  const stopDestroyModalType =
    scheduleModal === 'auto-stop' || scheduleModal === 'auto-destroy' ? scheduleModal : null;

  return (
    <>
      <p>
        You are about to reorder <strong>{displayName}</strong> with the same parameters as the original order. Adjust
        the schedule below if needed.
      </p>
      <DescriptionList
        isHorizontal
        isCompact
        style={{
          marginTop: 'var(--pf-t--global--spacer--md)',
          marginBottom: 'var(--pf-t--global--spacer--md)',
        }}
      >
        <DescriptionListGroup>
          <DescriptionListTerm>Start</DescriptionListTerm>
          <DescriptionListDescription>
            <AutoStopDestroy
              type="auto-start"
              onClick={() => setScheduleModal('start')}
              time={scheduleDates.startDate.getTime()}
              variant="extended"
            />
          </DescriptionListDescription>
        </DescriptionListGroup>
        {!isAutoStopDisabled(catalogItem) ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Stop</DescriptionListTerm>
            <DescriptionListDescription>
              <AutoStopDestroy
                type="auto-stop"
                onClick={() => setScheduleModal('auto-stop')}
                time={
                  scheduleDates.stopDate
                    ? scheduleDates.stopDate.getTime()
                    : scheduleDates.endDate.getTime()
                }
                variant="extended"
                destroyTimestamp={scheduleDates.endDate.getTime()}
              />
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
        {schedule.endDate ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Destroy</DescriptionListTerm>
            <DescriptionListDescription>
              <AutoStopDestroy
                type="auto-destroy"
                onClick={() => setScheduleModal('auto-destroy')}
                time={scheduleDates.endDate.getTime()}
                variant="extended"
                destroyTimestamp={scheduleDates.endDate.getTime()}
              />
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
      </DescriptionList>
      {validationMessage ? <Alert variant="warning" isInline title={validationMessage} /> : null}
      <ReorderScheduleStartModal
        isOpen={scheduleModal === 'start'}
        startDate={scheduleDates.startDate}
        title={displayName}
        onConfirm={(startDate) => {
          updateSchedule('startDate', startDate);
          setScheduleModal(null);
        }}
        onClose={() => setScheduleModal(null)}
      />
      <CatalogItemFormAutoStopDestroyModal
        type={stopDestroyModalType}
        autoStopDate={scheduleDates.stopDate}
        autoDestroyDate={scheduleDates.endDate}
        isAutoStopDisabled={isAutoStopDisabled(catalogItem)}
        maxRuntimeTimestamp={isAdmin ? maxAutoDestroyTime : maxAutoStopTime ?? undefined}
        defaultRuntimeTimestamp={defaultRuntimeTimestamp}
        maxDestroyTimestamp={
          isAdmin
            ? null
            : isWorkshop
              ? scheduleDates.startDate.getTime() - Date.now() + parseDuration('5d')
              : maxAutoDestroyTime
        }
        onConfirm={(dates) => {
          if (scheduleModal === 'auto-stop') {
            setScheduleDates((current) => ({
              ...current,
              stopDate: getConfirmedStopDate(dates.stopDate, current.endDate, current.stopDate),
            }));
          } else if (scheduleModal === 'auto-destroy') {
            updateSchedule('endDate', dates.endDate || scheduleDates.endDate);
          }
          setScheduleModal(null);
        }}
        onClose={() => setScheduleModal(null)}
        title={displayName}
      />
    </>
  );
};

export default ReorderModal;
