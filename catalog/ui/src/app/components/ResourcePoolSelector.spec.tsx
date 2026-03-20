import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResourcePoolSelector from './ResourcePoolSelector';
import { ResourcePool } from '@app/types';

const mockResourcePools: ResourcePool[] = [
  {
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourcePool',
    metadata: {
      name: 'pool-one',
      namespace: 'poolboy',
      uid: 'uid-1',
    },
    spec: {
      minAvailable: 1,
      resources: [],
    },
  },
  {
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourcePool',
    metadata: {
      name: 'pool-two',
      namespace: 'poolboy',
      uid: 'uid-2',
    },
    spec: {
      minAvailable: 1,
      resources: [],
    },
  },
  {
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourcePool',
    metadata: {
      name: 'test-pool',
      namespace: 'poolboy',
      uid: 'uid-3',
    },
    spec: {
      minAvailable: 1,
      resources: [],
    },
  },
];

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    data: mockResourcePools,
    error: undefined,
    isLoading: false,
  })),
}));

jest.mock('@app/api', () => ({
  apiPaths: {
    RESOURCE_POOLS: jest.fn(() => '/api/resource-pools'),
  },
  fetcherItemsInAllPages: jest.fn(),
}));

jest.mock('@app/util', () => ({
  compareK8sObjectsArr: jest.fn(),
  FETCH_BATCH_LIMIT: 50,
}));

describe('ResourcePoolSelector', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with placeholder text', () => {
    render(<ResourcePoolSelector onSelect={mockOnSelect} />);
    
    expect(screen.getByPlaceholderText('Select a pool (optional)')).toBeInTheDocument();
  });

  it('should render with selected pool value', () => {
    render(<ResourcePoolSelector selectedPool="pool-one" onSelect={mockOnSelect} />);
    
    const input = screen.getByLabelText('Select a resource pool') as HTMLInputElement;
    expect(input.value).toBe('pool-one');
  });

  it('should open dropdown when clicked', async () => {
    render(<ResourcePoolSelector onSelect={mockOnSelect} />);
    
    const input = screen.getByLabelText('Select a resource pool');
    await userEvent.click(input);
    
    await waitFor(() => {
      expect(screen.getByText('pool-one')).toBeInTheDocument();
      expect(screen.getByText('pool-two')).toBeInTheDocument();
      expect(screen.getByText('test-pool')).toBeInTheDocument();
    });
  });

  it('should call onSelect when a pool is selected', async () => {
    render(<ResourcePoolSelector onSelect={mockOnSelect} />);
    
    const input = screen.getByLabelText('Select a resource pool');
    await userEvent.click(input);
    
    await waitFor(() => {
      expect(screen.getByText('pool-one')).toBeInTheDocument();
    });
    
    await userEvent.click(screen.getByText('pool-one'));
    
    expect(mockOnSelect).toHaveBeenCalledWith('pool-one');
  });

  it('should filter pools based on input', async () => {
    render(<ResourcePoolSelector onSelect={mockOnSelect} />);
    
    const input = screen.getByLabelText('Select a resource pool');
    await userEvent.click(input);
    
    // All pools should be visible initially
    await waitFor(() => {
      expect(screen.getByText('test-pool')).toBeInTheDocument();
      expect(screen.getByText('pool-one')).toBeInTheDocument();
      expect(screen.getByText('pool-two')).toBeInTheDocument();
    });
  });

  it('should show clear button when a pool is selected', () => {
    render(<ResourcePoolSelector selectedPool="pool-one" onSelect={mockOnSelect} />);
    
    const clearButton = screen.getByLabelText('Clear selection');
    expect(clearButton).toBeInTheDocument();
  });

  it('should clear selection when clear button is clicked', async () => {
    render(<ResourcePoolSelector selectedPool="pool-one" onSelect={mockOnSelect} />);
    
    const clearButton = screen.getByLabelText('Clear selection');
    await userEvent.click(clearButton);
    
    expect(mockOnSelect).toHaveBeenCalledWith(undefined);
  });

  it('should have "Disabled" option in the dropdown', async () => {
    render(<ResourcePoolSelector onSelect={mockOnSelect} />);
    
    const input = screen.getByLabelText('Select a resource pool');
    await userEvent.click(input);
    
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('should call onSelect with "disabled" when Disabled option is selected', async () => {
    render(<ResourcePoolSelector onSelect={mockOnSelect} />);
    
    const input = screen.getByLabelText('Select a resource pool');
    await userEvent.click(input);
    
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
    
    await userEvent.click(screen.getByText('Disabled'));
    
    expect(mockOnSelect).toHaveBeenCalledWith('disabled');
  });
});

describe('ResourcePoolSelector with no pools', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    const useSWR = require('swr').default;
    useSWR.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
    });
  });

  it('should show "No pools available" when no pools exist', async () => {
    render(<ResourcePoolSelector onSelect={mockOnSelect} />);
    
    const input = screen.getByLabelText('Select a resource pool');
    await userEvent.click(input);
    
    await waitFor(() => {
      expect(screen.getByText('No pools available')).toBeInTheDocument();
    });
  });
});

describe('ResourcePoolSelector filtering', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    const useSWR = require('swr').default;
    useSWR.mockReturnValue({
      data: mockResourcePools,
      error: undefined,
      isLoading: false,
    });
  });

  it('should display all pools when dropdown is opened', async () => {
    render(<ResourcePoolSelector onSelect={mockOnSelect} />);
    
    const input = screen.getByLabelText('Select a resource pool');
    await userEvent.click(input);
    
    await waitFor(() => {
      expect(screen.getByText('pool-one')).toBeInTheDocument();
      expect(screen.getByText('pool-two')).toBeInTheDocument();
      expect(screen.getByText('test-pool')).toBeInTheDocument();
    });
  });
});
