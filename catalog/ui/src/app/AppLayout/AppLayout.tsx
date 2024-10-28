import React, { useState, Suspense } from 'react';
import { Page, PageSection, PageSidebar, PageSidebarBody } from '@patternfly/react-core';
import { IAppRouteAccessControl } from '@app/types';
import Header from '@app/Header/Header';
import LoadingSection from '@app/components/LoadingSection';
import useDocumentTitle from '@app/utils/useDocumentTitle';
import useSession from '@app/utils/useSession';
import useStatusPageEmbed from './useStatusPageEmbed';
import Navigation from './Navigation';
import { publicFetcher } from '@app/api';
import useSWRImmutable from 'swr/immutable';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

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
  const { partner_connect_header_enabled } = useInterfaceConfig();

  const onNavToggleMobile = () => {
    setIsNavOpenMobile(!isNavOpenMobile);
  };
  const onNavToggle = () => {
    setIsNavOpen(!isNavOpen);
  };
  const onPageResize = (props: { mobileView: boolean; windowSize: number }) => {
    setIsMobileView(props.mobileView);
  };

  const { data: partnerHeaderHtml } = useSWRImmutable<string>(
    partner_connect_header_enabled
      ? 'https://connect.redhat.com/en/api/chrome/authenticated/3.0/universal_and_primary'
      : null,
    publicFetcher
  );

  if (accessControl === 'admin' && !isAdmin) throw new Error('Access denied');

  const Sidebar = (
    <PageSidebar theme="dark" isSidebarOpen={isMobileView ? isNavOpenMobile : isNavOpen}>
      <PageSidebarBody>
        <Navigation />
      </PageSidebarBody>
    </PageSidebar>
  );
  const _Header = (
    <Header
      isNavOpen={isMobileView ? isNavOpenMobile : isNavOpen}
      isMobileView={isMobileView}
      onNavToggleMobile={onNavToggleMobile}
      onNavToggle={onNavToggle}
      theme={partner_connect_header_enabled ? 'light200' : 'dark'}
    />
  );

  return (
    <Suspense fallback={<LoadingSection />}>
      {partner_connect_header_enabled ? (
        <PageSection style={{ minHeight: 'auto', padding: 0, zIndex: 999, position: 'relative' }}>
          <div>
            <div dangerouslySetInnerHTML={{ __html: partnerHeaderHtml }}></div>
          </div>
        </PageSection>
      ) : null}
      <Page
        className={`app-layout ${optionalFlags.map((flag) => `optional-flags__${flag}`).join(' ')}`}
        mainContainerId="primary-app-container"
        header={_Header}
        sidebar={Sidebar}
        onPageResize={(_event, props: { mobileView: boolean; windowSize: number }) => onPageResize(props)}
      >
        {children}
      </Page>
    </Suspense>
  );
};

export default AppLayout;
