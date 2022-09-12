import React, { useEffect } from 'react';

const WorkshopActionModal: React.FC<{
  onConfirm: () => Promise<void>;
  action: 'start' | 'stop';
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setOnConfirmCb?: (_: any) => Promise<void>;
}> = ({ onConfirm, action, setTitle, setOnConfirmCb }) => {
  useEffect(() => {
    setOnConfirmCb(() => onConfirm);
  }, [onConfirm, setOnConfirmCb]);
  useEffect(() => {
    setTitle(action === 'start' ? 'Start services?' : 'Stop services?');
  }, [setTitle, action]);
  return (
    <p>
      {action === 'start'
        ? 'Cloud services will be started.'
        : 'Cloud services will be stopped as supported by service deployer.'}
    </p>
  );
};

export default WorkshopActionModal;
