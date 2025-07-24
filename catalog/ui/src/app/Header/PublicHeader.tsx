import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dropdown,
  DropdownList,
  DropdownItem,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadMain,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
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

  const onSelect = (event?: React.MouseEvent<Element, MouseEvent>, value?: string | number) => {
    event?.preventDefault();
    setUserHelpDropdownOpen(false);
    if (value) {
      window.open(value as string, '_blank');
    }
    return null;
  };

  const UserHelpDropdownItems = [
    <DropdownItem key="open-support" value={help_link}>
      {help_text}
    </DropdownItem>,
    <DropdownItem key="status-page-link" value={status_page_url}>
      Status Page
    </DropdownItem>,
    <DropdownItem key="support-sla" onClick={() => navigate('/support')}>
      Solution Support: Service Level
    </DropdownItem>,
    <DropdownItem key="learn-more" value={learn_more_link}>
      Learn more
    </DropdownItem>,
    <DropdownItem
      key="how-to-videos-link"
      value="https://videos.learning.redhat.com/channel/RHPDS%2B-%2BRed%2BHat%2BProduct%2Band%2BPortfolio%2BDemo%2BSystem/277722533"
    >
      How to videos
    </DropdownItem>,
  ];

  const HeaderTools = (
    <div style={{ marginLeft: 'auto' }}>
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
      <Dropdown
        aria-label="Help menu"
        isOpen={isUserHelpDropdownOpen}
        onOpenChange={(isOpen: boolean) => setUserHelpDropdownOpen(isOpen)}
        onSelect={onSelect}
        isScrollable
        popperProps={{ position: 'right' }}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            variant="plain"
            onClick={() => setUserHelpDropdownOpen(!isUserHelpDropdownOpen)}
            isExpanded={isUserHelpDropdownOpen}
            style={{ width: 'auto' }}
          >
            <div
              style={{
                display: 'flex',
                gap: 'var(--pf-v5-global--spacer--xs)',
                flexDirection: 'row',
                alignItems: 'center',
                color: '#fff',
              }}
            >
              <QuestionCircleIcon />
              Help
            </div>
          </MenuToggle>
        )}
      >
        <DropdownList>{UserHelpDropdownItems}</DropdownList>
      </Dropdown>
    </div>
  );

  return (
    <Masthead backgroundColor="dark" className="public-header-component">
      <MastheadMain>
        <MastheadBrand>
          <LogoImg />
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>{HeaderTools}</MastheadContent>
    </Masthead>
  );
};

export default PublicHeader;
