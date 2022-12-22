import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApplicationLauncher,
  ApplicationLauncherItem,
  DropdownPosition,
  PageHeader,
  PageHeaderTools,
} from '@patternfly/react-core';
import { QuestionCircleIcon } from '@patternfly/react-icons';
import UserInterfaceLogo from '@app/components/UserInterfaceLogo';

import './header.css';

const PublicHeader: React.FC = () => {
  const [isUserHelpDropdownOpen, setUserHelpDropdownOpen] = useState(false);
  const navigate = useNavigate();

  function LogoImg() {
    return <UserInterfaceLogo onClick={() => navigate('/')} style={{ width: '278px' }} />;
  }
  const openSupportCase = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    window.open('https://red.ht/open-support', '_blank');
  };

  const UserHelpDropdownItems = [
    <ApplicationLauncherItem key="open-support" component="button" onClick={openSupportCase} isExternal>
      Open Support Case
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem
      key="status-page-link"
      href="https://rhpds-demos.statuspage.io/"
      target="_blank"
      rel="noreferrer nofollow"
      isExternal
    >
      Status Page
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem key="support-sla" href="/support">
      Solution Support: SLAs
    </ApplicationLauncherItem>,
  ];

  const HeaderTools = (
    <PageHeaderTools>
      <ApplicationLauncher
        aria-label="Help menu"
        onSelect={() => setUserHelpDropdownOpen((prevIsOpen) => !prevIsOpen)}
        onToggle={(isOpen: boolean) => setUserHelpDropdownOpen(isOpen)}
        isOpen={isUserHelpDropdownOpen}
        items={UserHelpDropdownItems}
        position={DropdownPosition.right}
        toggleIcon={<QuestionCircleIcon />}
      />
    </PageHeaderTools>
  );

  return <PageHeader logo={<LogoImg />} className="public-header-component" headerTools={HeaderTools} />;
};

export default PublicHeader;
