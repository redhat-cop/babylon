import React from 'react';
import UnexpectedError from './UnexpectedError';
import { ErrorBoundary } from 'react-error-boundary';
import Footer from './Footer';
import NotFoundComponent from './NotFound';

const ErrorBoundaryPage: React.FC<{
  name: string;
  namespace?: string;
  type: string;
  includeFooter?: boolean;
}> = ({ name, namespace, type, includeFooter = true, children }) => (
  <ErrorBoundary
    onError={(err) => window['newrelic'] && window['newrelic'].noticeError(err)}
    fallbackRender={({ error }: { error: any }) => (
      <>
        {error?.status === 404 ? (
          <NotFoundComponent name={name} namespace={namespace} type={type} />
        ) : (
          <UnexpectedError />
        )}
        {includeFooter ? <Footer /> : null}
      </>
    )}
  >
    {children}
    {includeFooter ? <Footer /> : null}
  </ErrorBoundary>
);

export default ErrorBoundaryPage;
