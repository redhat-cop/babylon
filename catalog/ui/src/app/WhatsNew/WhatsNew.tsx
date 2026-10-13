import React from 'react';
import { Link, useParams } from 'react-router-dom';
import dompurify from 'dompurify';
import { Breadcrumb, BreadcrumbItem, EmptyState, EmptyStateBody, PageSection, Spinner, Title } from '@patternfly/react-core';
import useWhatsNew from './useWhatsNew';
import UnexpectedError from '@app/components/UnexpectedError';

import './whats-new.css';

function articleExcerpt(body: string): string {
  const content = dompurify.sanitize(body || '', { USE_PROFILES: { html: true }, RETURN_DOM: true }) as HTMLElement;
  const paragraphs = Array.from(content.querySelectorAll('p'));
  const paragraph = paragraphs.find((item) => item.textContent?.trim() && item.textContent !== item.querySelector('strong, b')?.textContent) || paragraphs[0];
  const text = (paragraph?.textContent || content.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 200).replace(/\s+\S*$/, '')}…` : text;
}

function articleHtml(body: string): string {
  const content = dompurify.sanitize(body || '', { USE_PROFILES: { html: true }, RETURN_DOM: true }) as HTMLElement;
  // Confluence authors also use short, standalone bold paragraphs as section headings.
  for (const paragraph of Array.from(content.children)) {
    const nodes = Array.from(paragraph.childNodes).filter((node) => node.textContent?.trim());
    if (paragraph.tagName !== 'P' || nodes.length !== 1 || !paragraph.firstElementChild?.matches('strong, b')) continue;
    if (nodes[0] !== paragraph.firstElementChild || (paragraph.textContent?.length || 0) > 120) continue;
    const heading = document.createElement('h2');
    heading.textContent = paragraph.textContent;
    paragraph.replaceWith(heading);
  }
  return content.innerHTML;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

const WhatsNew: React.FC = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const { data, error, isLoading } = useWhatsNew();

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

  if (error) return <UnexpectedError />;

  const page = pageId ? data?.children?.find((child) => child.id === pageId) : data;

  if (pageId && !page) {
    return (
      <PageSection hasBodyWrapper={false}>
        <EmptyState titleText="Page not found" headingLevel="h1">
          <EmptyStateBody>This update is no longer available.</EmptyStateBody>
          <Link to="/whats-new">Back to What&apos;s New</Link>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false} className={`whats-new-page ${pageId ? 'whats-new-page--article' : 'whats-new-page--index'}`}>
      <div className="whats-new-shell">
        {pageId ? (
          <Breadcrumb className="whats-new-breadcrumb" aria-label="News navigation">
            <BreadcrumbItem><Link to="/whats-new">{data?.title || "What's New"}</Link></BreadcrumbItem>
            <BreadcrumbItem isActive>{page.title}</BreadcrumbItem>
          </Breadcrumb>
        ) : null}
        <article>
          <header className="whats-new-header">
            <Title headingLevel="h1" className="whats-new-title">
              {page?.title || "What's New"}
            </Title>
            {pageId && page?.lastUpdated ? (
              <p className="whats-new-last-updated">
                Last updated: <time dateTime={page.lastUpdated}>{formatDate(page.lastUpdated)}</time>
              </p>
            ) : null}
          </header>
          <div
            className="whats-new-content"
            dangerouslySetInnerHTML={{
              __html: articleHtml(page?.body || ''),
            }}
          />
        </article>
        {!pageId && data?.children?.length ? (
          <section className="whats-new-posts" aria-labelledby="whats-new-posts-title">
            <h2 id="whats-new-posts-title" className="whats-new-posts-heading">Latest updates</h2>
            <ul className="whats-new-post-list">
              {data.children.map((child, index) => (
                <li key={child.id} className={`whats-new-post ${index === 0 ? 'whats-new-post--latest' : ''}`}>
                  <article>
                    <div className="whats-new-post-meta">
                      {index === 0 ? <span className="whats-new-latest-label">Latest</span> : null}
                      {child.createdAt ? <time dateTime={child.createdAt}>{formatDate(child.createdAt)}</time> : null}
                    </div>
                    <h3 className="whats-new-post-title">
                      <Link to={`/whats-new/${encodeURIComponent(child.id)}`}>{child.title}</Link>
                    </h3>
                    <p className="whats-new-post-excerpt">{articleExcerpt(child.body)}</p>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {pageId ? (
          <footer className="whats-new-footer">
            <Link to="/whats-new">Browse all updates</Link>
          </footer>
        ) : null}
      </div>
    </PageSection>
  );
};

export default WhatsNew;
