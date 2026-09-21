import React from 'react';
import { render, screen } from '@testing-library/react';
import useSWRImmutable from 'swr/immutable';
import WhatsNew from './WhatsNew';

jest.mock('swr/immutable', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@app/api', () => ({ fetcher: jest.fn() }));

const mockUseSWRImmutable = useSWRImmutable as jest.Mock;

function renderBody(body?: string) {
  mockUseSWRImmutable.mockReturnValue({ data: { body }, error: undefined, isLoading: false });
  return render(<WhatsNew />);
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
