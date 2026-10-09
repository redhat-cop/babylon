import React from 'react';
import { act, render, screen } from '@testing-library/react';
import RenderedContent from './RenderedContent';
import * as util from '@app/util';

describe('RenderedContent', () => {
  afterEach(() => jest.restoreAllMocks());

  it('converts real AsciiDoc with attributes and formatting', async () => {
    render(<RenderedContent content="Hello *{user}*!" options={{ vars: { user: 'Alice' } }} />);
    expect(await screen.findByText('Alice')).toHaveProperty('tagName', 'STRONG');
    expect(screen.queryByText('[object Promise]')).not.toBeInTheDocument();
  });

  it('sanitizes HTML and AsciiDoc passthrough output', async () => {
    for (const format of ['html', 'asciidoc'] as const) {
      const input = '<img src="x" onerror="alert(1)"><script>alert(1)</script><p>Safe</p>';
      const html = await util.renderContent(format === 'html' ? input : `++++\n${input}\n++++`, { format });
      expect(html).toContain('Safe');
      expect(html).not.toMatch(/onerror|<script/);
    }
  });

  it('renders a truncated plain-text preview', async () => {
    render(<RenderedContent content="*Hello* world" maxLength={5} />);
    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(document.querySelector('strong')).toBeNull();
  });

  it('updates when template attributes change', async () => {
    const { rerender } = render(<RenderedContent content="Hello {user}" options={{ vars: { user: 'Alice' } }} />);
    expect(await screen.findByText('Hello Alice')).toBeInTheDocument();
    rerender(<RenderedContent content="Hello {user}" options={{ vars: { user: 'Bob' } }} />);
    expect(screen.queryByText('Hello Alice')).not.toBeInTheDocument();
    expect(await screen.findByText('Hello Bob')).toBeInTheDocument();
  });

  it('ignores stale conversions and handles failures', async () => {
    let resolveOld: (html: string) => void;
    jest
      .spyOn(util, 'renderContent')
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValueOnce('<p>New content</p>')
      .mockRejectedValueOnce(new Error('Conversion failed'));
    const { rerender } = render(<RenderedContent content="old" />);
    rerender(<RenderedContent content="new" />);
    expect(await screen.findByText('New content')).toBeInTheDocument();
    await act(async () => {
      resolveOld('<p>Old content</p>');
    });
    expect(screen.queryByText('Old content')).not.toBeInTheDocument();
    rerender(<RenderedContent content="invalid" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to display this content.');
  });
});
