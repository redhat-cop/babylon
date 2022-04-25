import React from 'react';
import { useHistory } from 'react-router-dom';

import { PageHeader } from '@patternfly/react-core';

import UserInterfaceLogo from '@app/components/UserInterfaceLogo';

const WorkshopHeader: React.FunctionComponent = () => {
  const history = useHistory();
  return <PageHeader className="workshop" logo={<UserInterfaceLogo onClick={() => history.push('/')} />} />;
};

export default WorkshopHeader;
