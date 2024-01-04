import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApplicationLauncher,
  ApplicationLauncherItem,
  Button,
  DropdownPosition,
  PageHeader,
  PageHeaderTools,
} from '@patternfly/react-core';
import CommentIcon from '@patternfly/react-icons/dist/js/icons/comment-icon';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';
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
      href="https://rhdp.statuspage.io/"
      target="_blank"
      rel="noreferrer nofollow"
      isExternal
    >
      Status Page
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem key="support-sla" href="/support">
      Solution Support: Service Level
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem
      key="how-to-videos-link"
      href="https://content.redhat.com/us/en/product/cross-portfolio-initiatives/rhdp.html"
      target="_blank"
      rel="noreferrer nofollow"
      isExternal
    >
      Learn more
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem
      key="how-to-videos-link"
      href="https://videos.learning.redhat.com/channel/RHPDS%2B-%2BRed%2BHat%2BProduct%2Band%2BPortfolio%2BDemo%2BSystem/277722533"
      target="_blank"
      rel="noreferrer nofollow"
      isExternal
    >
      How to videos
    </ApplicationLauncherItem>,
  ];

  const HeaderTools = (
    <PageHeaderTools>
      <Button
        variant="link"
        icon={<CommentIcon />}
        style={{ color: '#fff' }}
        onClick={() =>
          window.open(
            'https://docs.google.com/forms/d/e/1FAIpQLSfwGW7ql2lDfaLDpg4Bgj_puFEVsM0El6-Nz8fyH48RnGLDrA/viewform?usp=sf_link',
            '_blank',
          )
        }
      >
        Feedback
      </Button>
      <ApplicationLauncher
        aria-label="Help menu"
        onSelect={() => setUserHelpDropdownOpen((prevIsOpen) => !prevIsOpen)}
        onToggle={(isOpen: boolean) => setUserHelpDropdownOpen(isOpen)}
        isOpen={isUserHelpDropdownOpen}
        items={UserHelpDropdownItems}
        position={DropdownPosition.right}
        toggleIcon={
          <div
            style={{ display: 'flex', gap: 'var(--pf-global--spacer--xs)', flexDirection: 'row', alignItems: 'center' }}
          >
            <QuestionCircleIcon />
            Help
          </div>
        }
      />
    </PageHeaderTools>
  );

  return <PageHeader logo={<LogoImg />} className="public-header-component" headerTools={HeaderTools} />;
};

export default PublicHeader;
