import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogItem } from '@app/types';
import { BABYLON_DOMAIN } from '@app/util';
import catalogItem from '../__mocks__/catalogItem.json';
import CatalogLabelSelector from './CatalogLabelSelector';

const values = ['Server_Cloud_OS', 'Automation', 'AI_Platform', 'Virtualization', 'Application_Platform', 'Container_Management', 'Other', 'Edge_Computing'];
const items = values.map((value) => ({
  ...catalogItem,
  metadata: {
    ...catalogItem.metadata,
    labels: { [`${BABYLON_DOMAIN}/TDP1`]: value, [`${BABYLON_DOMAIN}/TDP2`]: value.toLowerCase() },
  },
})) as CatalogItem[];

test('offers one combined checkbox filter, counts each item once, and supports selecting and clearing values', async () => {
  const user = userEvent.setup();
  const onSelect = jest.fn();
  const props = { catalogItems: items, filteredCatalogItems: items, onSelect };
  const { rerender } = render(<CatalogLabelSelector {...props} selected={{}} />);
  await user.click(screen.getByText('Technical Decision Point'));
  expect(screen.queryByText('TDP1')).not.toBeInTheDocument();
  expect(screen.queryByText('TDP2')).not.toBeInTheDocument();
  expect(screen.getAllByRole('checkbox')).toHaveLength(values.length);
  for (const value of values) {
    expect(screen.getByRole('checkbox', { name: `${value.replace(/_/g, ' ')} (1)` })).toBeInTheDocument();
  }
  await user.click(screen.getByRole('checkbox', { name: 'Edge Computing (1)' }));
  expect(onSelect).toHaveBeenLastCalledWith({ technical_decision_point: ['edge_computing'] });
  await user.click(screen.getByRole('checkbox', { name: 'Automation (1)' }));
  expect(onSelect).toHaveBeenLastCalledWith({ technical_decision_point: ['automation'] });
  rerender(<CatalogLabelSelector {...props} selected={{ technical_decision_point: ['automation'] }} />);
  await user.click(screen.getByRole('checkbox', { name: 'AI Platform (1)' }));
  expect(onSelect).toHaveBeenLastCalledWith({ technical_decision_point: ['automation', 'ai_platform'] });
  await user.click(screen.getByRole('checkbox', { name: 'Automation (1)' }));
  expect(onSelect).toHaveBeenLastCalledWith(null);
});
