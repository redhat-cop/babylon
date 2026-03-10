import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UserDisabledModal from './UserDisabledModal';

describe('UserDisabledModal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  test('renders modal with correct title when open', () => {
    render(<UserDisabledModal isOpen={true} onClose={mockOnClose} />);
    
    expect(screen.getByText('Account Access Restricted')).toBeInTheDocument();
  });

  test('renders modal with disabled account message', () => {
    render(<UserDisabledModal isOpen={true} onClose={mockOnClose} />);
    
    expect(
      screen.getByText('Your account has been disabled and you cannot place new orders at this time.')
    ).toBeInTheDocument();
  });

  test('renders modal with help menu instructions', () => {
    render(<UserDisabledModal isOpen={true} onClose={mockOnClose} />);
    
    expect(screen.getByText(/contact our support team/)).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  test('renders close button in footer', () => {
    render(<UserDisabledModal isOpen={true} onClose={mockOnClose} />);
    
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  test('calls onClose when footer close button is clicked', () => {
    render(<UserDisabledModal isOpen={true} onClose={mockOnClose} />);
    
    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('does not render modal content when isOpen is false', () => {
    render(<UserDisabledModal isOpen={false} onClose={mockOnClose} />);
    
    expect(screen.queryByText('Account Access Restricted')).not.toBeInTheDocument();
  });

  test('has correct aria-label for accessibility', () => {
    render(<UserDisabledModal isOpen={true} onClose={mockOnClose} />);
    
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Account access restricted');
  });
});
