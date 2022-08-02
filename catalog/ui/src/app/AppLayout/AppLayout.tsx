import React, { useState, Suspense } from 'react';
import useStatusPageEmbed from './useStatusPageEmbed';
import { Page, PageSidebar } from '@patternfly/react-core';
import Navigation from './Navigation';
import Header from '@app/Header/Header';
import LoadingSection from '@app/components/LoadingSection';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isMobileView, setIsMobileView] = useState(true);
  const [isNavOpenMobile, setIsNavOpenMobile] = useState(false);
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
    />
  );

  return (
    <Suspense fallback={<LoadingSection />}>
      <Page
        className="app-layout"
        mainContainerId="primary-app-container"
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
