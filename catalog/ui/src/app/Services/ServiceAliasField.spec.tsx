import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ServiceAliasField from './ServiceAliasField';

const setup = (value = '', onSave = jest.fn().mockResolvedValue(undefined)) => {
  render(<ServiceAliasField value={value} onSave={onSave} />);
  return { input: screen.getByLabelText('Service alias') as HTMLInputElement, onSave };
};

describe('ServiceAliasField', () => {
  test('explains where the alias is shown', () => {
    setup();
    expect(screen.getByText('Shown as a tag next to this service in My Services.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. ACME demo')).toBeInTheDocument();
  });

  test('does not save while typing, saves trimmed value on Enter', async () => {
    const { input, onSave } = setup();
    fireEvent.change(input, { target: { value: '  ACME demo ' } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('ACME demo');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  test('saves on blur and skips unchanged values', () => {
    const { input, onSave } = setup('ACME');
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'ACME 2' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('ACME 2');
  });

  test('Escape reverts unsaved changes', () => {
    const { input, onSave } = setup('ACME');
    fireEvent.change(input, { target: { value: 'Other' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('ACME');
    expect(onSave).not.toHaveBeenCalled();
  });

  test('shows an error when saving fails', async () => {
    const { input } = setup('', jest.fn().mockRejectedValue(new Error('boom')));
    fireEvent.change(input, { target: { value: 'ACME' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/Couldn't save the alias/)).toBeInTheDocument());
  });
});
