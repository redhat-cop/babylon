import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import {
  ApplicationLauncher,
  ApplicationLauncherItem,
  DropdownPosition,
  PageHeader,
  PageHeaderTools,
} from '@patternfly/react-core/deprecated';
import CommentIcon from '@patternfly/react-icons/dist/js/icons/comment-icon';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';
import UserInterfaceLogo from '@app/components/UserInterfaceLogo';
import { useInterface } from '@app/utils/useInterfaceConfig';

import './header.css';

const PublicHeader: React.FC = () => {
  const [isUserHelpDropdownOpen, setUserHelpDropdownOpen] = useState(false);
  const { help_link, help_text, status_page_url, feedback_link, learn_more_link } = useInterface('rhpds').data;
  const navigate = useNavigate();

  function LogoImg() {
    return <UserInterfaceLogo theme="dark" onClick={() => navigate('/')} style={{ width: '278px' }} />;
  }
  const openSupportCase = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    window.open(help_link, '_blank');
  };

  const UserHelpDropdownItems = [
    <ApplicationLauncherItem key="open-support" component="button" onClick={openSupportCase} isExternal>
      {help_text}
    </ApplicationLauncherItem>,
    <ApplicationLauncherItem
      key="status-page-link"
      href={status_page_url}
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
      href={learn_more_link}
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
      {feedback_link ? (
        <Button
          variant="link"
          icon={<CommentIcon />}
          style={{ color: '#fff' }}
          onClick={() => window.open(feedback_link, '_blank')}
        >
          Feedback
        </Button>
      ) : null}
      <ApplicationLauncher
        aria-label="Help menu"
        onSelect={() => setUserHelpDropdownOpen((prevIsOpen) => !prevIsOpen)}
        onToggle={(_event, isOpen: boolean) => setUserHelpDropdownOpen(isOpen)}
        isOpen={isUserHelpDropdownOpen}
        items={UserHelpDropdownItems}
        position={DropdownPosition.right}
        toggleIcon={
          <div
            style={{
              display: 'flex',
              gap: 'var(--pf-v5-global--spacer--xs)',
              flexDirection: 'row',
              alignItems: 'center',
            }}
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
