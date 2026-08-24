import React, { useState, useEffect, Suspense } from 'react';
import { Page, PageSection, PageSidebar, PageSidebarBody } from '@patternfly/react-core';
import { IAppRouteAccessControl } from '@app/types';
import Header from '@app/Header/Header';
import LoadingSection from '@app/components/LoadingSection';
import useDocumentTitle from '@app/utils/useDocumentTitle';
import useSession from '@app/utils/useSession';
import Navigation from './Navigation';
import { publicFetcher } from '@app/api';
import dompurify from 'dompurify';
import useSWRImmutable from 'swr/immutable';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import { NotificationDrawerProvider, useNotificationDrawer } from './NotificationDrawerContext';

const optionalFlags = process.env.OPTIONAL_FLAGS ? process.env.OPTIONAL_FLAGS.split(' ') : [];

const AppLayout: React.FC<{ children: React.ReactNode; title: string; accessControl?: IAppRouteAccessControl }> = ({
  children,
  title,
  accessControl,
}) => {
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isMobileView, setIsMobileView] = useState(true);
  const [isNavOpenMobile, setIsNavOpenMobile] = useState(false);
  const [partnerScriptsReady, setPartnerScriptsReady] = useState(false);
  useDocumentTitle(title);
  const { isAdmin, email, fullName } = useSession().getSession();
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
      ? 'https://connect.redhat.com/en/api/chrome/authenticated/4.0/universal_and_primary?include_dependencies=true'
      : null,
    publicFetcher,
  );

  useEffect(() => {
    if (!partnerHeaderHtml) return () => {};

    const parser = new DOMParser();
    const doc = parser.parseFromString(partnerHeaderHtml, 'text/html');

    const linkElements = doc.querySelectorAll('link[rel="stylesheet"]');
    linkElements.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      const absoluteHref = href.startsWith('/') ? `https://connect.redhat.com${href}` : href;
      if (document.querySelector(`link[href="${absoluteHref}"]`)) return;
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = absoluteHref;
      document.head.appendChild(el);
    });

    const scriptElements = doc.querySelectorAll('script[src]');
    const newScripts: HTMLScriptElement[] = [];
    scriptElements.forEach((script) => {
      const src = script.getAttribute('src');
      if (!src) return;
      const absoluteSrc = src.startsWith('/') ? `https://connect.redhat.com${src}` : src;
      if (document.querySelector(`script[src="${absoluteSrc}"]`)) return;
      const el = document.createElement('script');
      el.src = absoluteSrc;
      if (script.getAttribute('type')) el.type = script.getAttribute('type');
      newScripts.push(el);
      document.head.appendChild(el);
    });

    if (newScripts.length === 0) {
      setPartnerScriptsReady(true);
    } else {
      let loaded = 0;
      const onLoad = () => {
        loaded++;
        if (loaded >= newScripts.length) setPartnerScriptsReady(true);
      };
      newScripts.forEach((el) => {
        el.addEventListener('load', onLoad);
        el.addEventListener('error', onLoad);
      });
    }

    return () => {
      setPartnerScriptsReady(false);
      document.head.querySelectorAll('link[href*="connect.redhat.com"]').forEach((el) => el.remove());
      document.head.querySelectorAll('script[src*="connect.redhat.com"]').forEach((el) => el.remove());
    };
  }, [partnerHeaderHtml]);

  useEffect(() => {
    if (!partnerScriptsReady || !email) return;

    const loginName = email.includes('@') ? email.split('@')[0] : email;

    document.dispatchEvent(
      new CustomEvent('rhpc-nav:login', {
        detail: {
          login_name: loginName,
          email_address: email,
          company_name: '',
          ...(fullName ? { name: fullName } : {}),
        },
      }),
    );
  }, [partnerScriptsReady, email, fullName]);

  if (accessControl === 'admin' && !isAdmin) throw new Error('Access denied');

  const Sidebar = (
    <PageSidebar isSidebarOpen={isMobileView ? isNavOpenMobile : isNavOpen} style={{ margin: 0, zIndex: 998 }}>
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
    />
  );

  const PageContent = () => {
    const notificationDrawerContext = useNotificationDrawer();
    return (
      <Page
        className={`app-layout ${optionalFlags.map((flag) => `optional-flags__${flag}`).join(' ')}`}
        mainContainerId="primary-app-container"
        masthead={_Header}
        sidebar={Sidebar}
        onPageResize={(_event, props: { mobileView: boolean; windowSize: number }) => onPageResize(props)}
        notificationDrawer={notificationDrawerContext?.notificationDrawer || undefined}
        isNotificationDrawerExpanded={notificationDrawerContext?.isDrawerExpanded ?? false}
      >
        {children}
      </Page>
    );
  };

  return (
    <NotificationDrawerProvider>
      <Suspense fallback={<LoadingSection />}>
        {partner_connect_header_enabled ? (
          <PageSection
            hasBodyWrapper={false}
            style={{ minHeight: 'auto', padding: 0, zIndex: 999, position: 'relative' }}
          >
            <div>
              <div
                dangerouslySetInnerHTML={{
                  __html: dompurify.sanitize(
                    (partnerHeaderHtml || '').replace(
                      /(src|href)="(\/[^"]*?)"/g,
                      '$1="https://connect.redhat.com$2"',
                    ),
                    {
                      FORCE_BODY: true,
                      ADD_TAGS: ['style', 'svg', 'path'],
                      ADD_ATTR: [
                        'part',
                        'slot',
                        'icon',
                        'set',
                        'name',
                        'variant',
                        'color-palette',
                        'viewBox',
                        'fill',
                        'd',
                        'xmlns',
                      ],
                      CUSTOM_ELEMENT_HANDLING: {
                        tagNameCheck: /^(rh|pfe)-/,
                        attributeNameCheck: /^data-/,
                        allowCustomizedBuiltInElements: true,
                      },
                    },
                  ),
                }}
              ></div>
            </div>
          </PageSection>
        ) : null}
        <PageContent />
      </Suspense>
    </NotificationDrawerProvider>
  );
};

export default AppLayout;
