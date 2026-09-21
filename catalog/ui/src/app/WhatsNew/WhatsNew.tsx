import React from 'react';
import dompurify from 'dompurify';
import { EmptyState, EmptyStateBody, PageSection, Spinner, Title } from '@patternfly/react-core';
import useSWRImmutable from 'swr/immutable';
import { fetcher } from '@app/api';
import UnexpectedError from '@app/components/UnexpectedError';

import './whats-new.css';

type WhatsNewData = {
  title: string;
  body: string;
  version: number;
  lastUpdated: string;
};

const WhatsNew: React.FC = () => {
  const { data, error, isLoading } = useSWRImmutable<WhatsNewData>('/api/whats-new', fetcher);

  if (isLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <EmptyState>
          <Spinner size="xl" />
          <EmptyStateBody>Loading...</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (error) {
    return <UnexpectedError />;
  }

  return (
    <>
      <PageSection hasBodyWrapper={false} className="whats-new-header">
        <Title headingLevel="h1" size="xl">
          {data?.title || "What's New"}
        </Title>
        {data?.lastUpdated ? (
          <p className="whats-new-last-updated">
            Last updated: {new Date(data.lastUpdated).toLocaleDateString()}
          </p>
        ) : null}
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <div
          className="whats-new-content"
          dangerouslySetInnerHTML={{
            __html: dompurify.sanitize(data?.body || '', { USE_PROFILES: { html: true } }),
          }}
        />
      </PageSection>
    </>
  );
};

export default WhatsNew;
