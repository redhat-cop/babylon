import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useSWR from 'swr';
import WhatsNew from './WhatsNew';

jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@app/api', () => ({ fetcher: jest.fn(), apiPaths: { WHATS_NEW: () => '/api/whats-new' } }));

const mockUseSWR = useSWR as jest.Mock;

function renderPage(path = '/whats-new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/whats-new" element={<WhatsNew />} />
        <Route path="/whats-new/:pageId" element={<WhatsNew />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderBody(body?: string) {
  mockUseSWR.mockReturnValue({ data: { body }, error: undefined, isLoading: false });
  return renderPage();
}

describe('WhatsNew HTML sanitization', () => {
  it('preserves formatted content and safe links and images', () => {
    renderBody(`
      <h2>Release notes</h2>
      <p>A <strong>new</strong> feature</p>
      <ul><li>Improvement</li></ul>
      <table><tbody><tr><td>Details</td></tr></tbody></table>
      <a href="https://example.com/notes">Read more</a>
      <img src="https://example.com/image.png" alt="Feature preview">
    `);

    expect(screen.getByRole('heading', { name: 'Release notes' })).toBeInTheDocument();
    expect(screen.getByText('new').tagName).toBe('STRONG');
    expect(screen.getByRole('listitem')).toHaveTextContent('Improvement');
    expect(screen.getByRole('cell')).toHaveTextContent('Details');
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/notes');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.png');
  });

  it('removes scripts, event handlers, embedded documents, and executable URLs', () => {
    const { container } = renderBody(`
      <script>alert(document.cookie)</script>
      <img src="https://example.com/image.png" alt="Preview" onerror="alert(1)">
      <a href="javascript:alert(1)" onclick="alert(1)">Unsafe link</a>
      <a href="java&#x73;cript:alert(1)">Encoded unsafe link</a>
      <iframe srcdoc="<script>alert(1)</script>"></iframe>
      <svg onload="alert(1)"></svg>
    `);

    expect(container.querySelector('script, iframe, svg')).toBeNull();
    expect(container.querySelector('[onerror], [onclick], [onload]')).toBeNull();
    expect(screen.getByText('Unsafe link')).not.toHaveAttribute('href');
    expect(screen.getByText('Encoded unsafe link')).not.toHaveAttribute('href');
  });

  it('renders an empty body when content is missing', () => {
    const { container } = renderBody();
    expect(container.querySelector('.whats-new-content')).toBeEmptyDOMElement();
  });
});

const data = {
  title: 'Updates', body: '<p>Parent content</p>', lastUpdated: '2026-10-01T00:00:00Z',
  children: [{
    id: '2', title: 'Child update', lastUpdated: '2026-10-13T00:00:00Z',
    body: '<p>Child content</p><img onerror="alert(1)"><script>alert(1)</script>',
  }],
};

it('lists safe child previews without the parent update date, and supports navigation back', () => {
  mockUseSWR.mockReturnValue({ data });
  const { container } = renderPage();
  expect(screen.getByText('Parent content')).toBeInTheDocument();
  expect(screen.getByText('Child content')).toHaveClass('whats-new-post-excerpt');
  expect(container.querySelector('.whats-new-posts img, .whats-new-posts script')).toBeNull();
  expect(screen.queryByText(/Last updated:/)).not.toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Child update' });
  expect(link).toHaveAttribute('href', '/whats-new/2');
  fireEvent.click(link);
  expect(screen.getByRole('heading', { name: 'Child update' })).toBeInTheDocument();
  expect(screen.getByText('Child content')).toBeInTheDocument();
  expect(screen.queryByText('Parent content')).not.toBeInTheDocument();
  expect(screen.getByText(/Last updated:/)).toHaveTextContent(new Date(data.children[0].lastUpdated).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
  expect(container.querySelector('script, [onerror]')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Updates' }));
  expect(screen.getByText('Parent content')).toBeInTheDocument();
  expect(screen.queryByText(/Last updated:/)).not.toBeInTheDocument();
});

it('opens child content directly by URL', () => {
  mockUseSWR.mockReturnValue({ data });
  renderPage('/whats-new/2');
  expect(screen.getByText('Child content')).toBeInTheDocument();
});

it('handles an unknown child page', () => {
  mockUseSWR.mockReturnValue({ data });
  renderPage('/whats-new/missing');
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: "Back to What's New" })).toHaveAttribute('href', '/whats-new');
});

it('treats standalone bold section titles as headings without changing inline emphasis', () => {
  renderBody('<p><strong>Workshop improvements</strong></p><p>A <strong>new</strong> experience.</p>');
  expect(screen.getByRole('heading', { name: 'Workshop improvements', level: 2 })).toBeInTheDocument();
  expect(screen.getByText('new').tagName).toBe('STRONG');
});
