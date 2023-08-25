import React, { useState } from 'react';
import { Button, Checkbox, ExpandableSection, Form, FormGroup, Tooltip } from '@patternfly/react-core';
import { FilterAltIcon } from '@patternfly/react-icons';

import './catalog-label-selector.css';

const CatalogCategorySelector: React.FC<{
  onSelect: (statuses: string[]) => void;
  selected: string[];
}> = ({ onSelect, selected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  function handleOnChange(key: string) {
    if (selected.includes(key)) {
      onSelect(selected.filter((s) => s !== key));
    } else {
      onSelect([...selected, key]);
    }
  }
  return (
    <Form className="catalog-label-selector">
      <ExpandableSection
        key="catalog-admin-selector"
        isExpanded={isExpanded}
        toggleContent={
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <p>Admin</p>
            {selected.length > 0 ? (
              <Tooltip content={<div>Clear filter</div>}>
                <Button
                  variant="plain"
                  component="span"
                  style={{ marginRight: 0, marginLeft: 'auto', padding: 0 }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect([]);
                  }}
                >
                  <FilterAltIcon />
                </Button>
              </Tooltip>
            ) : null}
          </div>
        }
        onToggle={(expanded: boolean) => setIsExpanded(expanded)}
      >
        <FormGroup>
          <Checkbox
            id="operational"
            key="operational"
            label="Operational"
            isChecked={selected.includes('operational')}
            onChange={() => handleOnChange('operational')}
          />
          <Checkbox
            id="degraded-performance"
            key="degraded-performance"
            label="Degraded performance"
            isChecked={selected.includes('degraded-performance')}
            onChange={() => handleOnChange('degraded-performance')}
          />
          <Checkbox
            id="partial-outage"
            key="partial-outage"
            label="Partial outage"
            isChecked={selected.includes('partial-outage')}
            onChange={() => handleOnChange('partial-outage')}
          />
          <Checkbox
            id="major-outage"
            key="major-outage"
            label="Major outage"
            isChecked={selected.includes('major-outage')}
            onChange={() => handleOnChange('major-outage')}
          />
          <Checkbox
            id="under-maintenance"
            key="under-maintenance"
            label="Under maintenance"
            isChecked={selected.includes('under-maintenance')}
            onChange={() => handleOnChange('under-maintenance')}
          />
        </FormGroup>
      </ExpandableSection>
    </Form>
  );
};

export default CatalogCategorySelector;
