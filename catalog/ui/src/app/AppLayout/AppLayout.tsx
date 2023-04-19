import React, { useState, Suspense } from 'react';
import { Page, PageSidebar } from '@patternfly/react-core';
import { IAppRouteAccessControl } from '@app/types';
import Header from '@app/Header/Header';
import LoadingSection from '@app/components/LoadingSection';
import useDocumentTitle from '@app/utils/useDocumentTitle';
import useSession from '@app/utils/useSession';
import useStatusPageEmbed from './useStatusPageEmbed';
import Navigation from './Navigation';

const optionalFlags = process.env.OPTIONAL_FLAGS ? process.env.OPTIONAL_FLAGS.split(' ') : [];

const AppLayout: React.FC<{ children: React.ReactNode; title: string; accessControl?: IAppRouteAccessControl }> = ({
  children,
  title,
  accessControl,
}) => {
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isMobileView, setIsMobileView] = useState(true);
  const [isNavOpenMobile, setIsNavOpenMobile] = useState(false);
  useDocumentTitle(title);
  useStatusPageEmbed();
  const { isAdmin } = useSession().getSession();

  const onNavToggleMobile = () => {
    setIsNavOpenMobile(!isNavOpenMobile);
  };
  const onNavToggle = () => {
    setIsNavOpen(!isNavOpen);
  };
  const onPageResize = (props: { mobileView: boolean; windowSize: number }) => {
    setIsMobileView(props.mobileView);
  };

  if (accessControl === 'admin' && !isAdmin) throw new Error('Access denied');

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
        className={`app-layout ${optionalFlags.map((flag) => `optional-flags__${flag}`).join(' ')}`}
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
