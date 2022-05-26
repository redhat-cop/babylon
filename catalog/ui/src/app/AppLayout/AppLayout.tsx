import React, { useState, Suspense } from 'react';
import useStatusPageEmbed from './useStatusPageEmbed';
import { EmptyState, EmptyStateIcon, Page, PageSection, PageSidebar } from '@patternfly/react-core';
import Navigation from './Navigation';
import Header from '@app/Header/Header';
import useSession from './useSession';
import LoadingIcon from '@app/components/LoadingIcon';

const AppLayout: React.FunctionComponent<{ children: React.ReactNode }> = ({ children }) => {
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isMobileView, setIsMobileView] = useState(true);
  const [isNavOpenMobile, setIsNavOpenMobile] = useState(false);
  const { getSession } = useSession();
  useStatusPageEmbed();

  const onNavToggleMobile = () => {
    setIsNavOpenMobile(!isNavOpenMobile);
  };
  const onNavToggle = () => {
    setIsNavOpen(!isNavOpen);
  };
  const onPageResize = (props: { mobileView: boolean; windowSize: number }) => {
    setIsMobileView(props.mobileView);
  };

  const Sidebar = (
    <PageSidebar theme="dark" nav={<Navigation />} isNavOpen={isMobileView ? isNavOpenMobile : isNavOpen} />
  );
  const _Header = (
    <Header
      isNavOpen={isMobileView ? isNavOpenMobile : isNavOpen}
      isMobileView={isMobileView}
      onNavToggleMobile={onNavToggleMobile}
      onNavToggle={onNavToggle}
      getSession={getSession}
    />
  );

  return (
    <Suspense
      fallback={
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        </PageSection>
      }
    >
      <Page
        className="app-layout"
        mainContainerId="primary-app-layout-container"
        header={_Header}
        sidebar={Sidebar}
        onPageResize={onPageResize}
      >
        {children}
      </Page>
    </Suspense>
  );
};

export default AppLayout;
