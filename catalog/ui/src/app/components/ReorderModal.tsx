import React, { useEffect } from 'react';
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from '@patternfly/react-core';
import LocalTimestamp from '@app/components/LocalTimestamp';
import { ReorderSchedule } from '@app/reorder-utils';

const ReorderModal: React.FC<{
  displayName: string;
  schedule: ReorderSchedule;
  onReorder: () => Promise<void>;
  setOnConfirmCb?: React.Dispatch<React.SetStateAction<() => Promise<void>>>;
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
}> = ({ displayName, schedule, onReorder, setOnConfirmCb, setTitle }) => {
  useEffect(() => {
    setTitle?.('Reorder');
    setOnConfirmCb?.(() => onReorder);
  }, [onReorder, setOnConfirmCb, setTitle]);

  return (
    <>
      <p>
        You are about to reorder <strong>{displayName}</strong> with the same parameters as the original order.
      </p>
      <DescriptionList isHorizontal compact>
        {schedule.startDate ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Start</DescriptionListTerm>
            <DescriptionListDescription>
              <LocalTimestamp date={schedule.startDate} />
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
        {schedule.stopDate ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Stop</DescriptionListTerm>
            <DescriptionListDescription>
              <LocalTimestamp date={schedule.stopDate} />
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
        {schedule.endDate ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Destroy</DescriptionListTerm>
            <DescriptionListDescription>
              <LocalTimestamp date={schedule.endDate} />
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
      </DescriptionList>
    </>
  );
};

export default ReorderModal;
