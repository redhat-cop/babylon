import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageSection, Tab, TabTitleText, Tabs } from '@patternfly/react-core';

/** Services / Orders switch shown at the top of My Services when catalog item orders are enabled. */
const MyServicesTabs: React.FC<{ active: 'services' | 'orders'; servicesPath: string }> = ({ active, servicesPath }) => {
  const navigate = useNavigate();
  return (
    <PageSection hasBodyWrapper={false} padding={{ default: 'noPadding' }} className="my-services-tabs">
      <Tabs
        activeKey={active}
        onSelect={(_event, key) => navigate(key === 'orders' ? '/orders' : servicesPath)}
        aria-label="My Services sections"
        inset={{ default: 'insetMd' }}
      >
        <Tab eventKey="services" title={<TabTitleText>Services</TabTitleText>} />
        <Tab eventKey="orders" title={<TabTitleText>Orders</TabTitleText>} />
      </Tabs>
    </PageSection>
  );
};

export default MyServicesTabs;
