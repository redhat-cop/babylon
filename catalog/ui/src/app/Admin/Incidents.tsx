import React from 'react';
import {
  ActionList,
  ActionListItem,
  Button,
  Form,
  FormGroup,
  PageSection,
  PageSectionVariants,
  Switch,
  TextArea,
  Tooltip,
} from '@patternfly/react-core';
import useSWR from 'swr';
import { apiPaths, fetcher } from '@app/api';

import './admin.css';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import { Incident } from '@app/types';

const Incidents: React.FC = () => {
  const { data } = useSWR<Incident[]>(apiPaths.INCIDENTS({ status: 'active' }), fetcher, {
    refreshInterval: 8000,
  });
  console.log(data);
  return (
    <PageSection key="body" variant={PageSectionVariants.light}>
      <Form className="catalog-item-admin__form">
        <FormGroup fieldId="status" isRequired={true} label="Status">
          <div className="catalog-item-admin__group-control--single">
            <Tooltip position="right" content={<div>Catalog Item status, should be the same as in StatusPage.io</div>}>
              <OutlinedQuestionCircleIcon
                aria-label="Catalog Item status, should be the same as in StatusPage.io"
                className="tooltip-icon-only"
              />
            </Tooltip>
          </div>
        </FormGroup>
        <FormGroup fieldId="disabled">
          <div className="catalog-item-admin__group-control--single">
            <Switch id="no-label-switch-on" aria-label="Message when on" isChecked={true} onChange={null} />;
          </div>
        </FormGroup>
        <FormGroup fieldId="comment" label="Comments (only visible to admins)">
          {/* <TextArea
            id="comment"
            onChange={(v) => setComment(v)}
            value={comment}
            placeholder="Add comment"
            aria-label="Add comment"
            className="catalog-item-admin__add-comment"
         />*/}
        </FormGroup>
        {/*<ActionList>
          <ActionListItem>
            <Button isAriaDisabled={false} isDisabled={isLoading} onClick={saveForm}>
              Save
            </Button>
          </ActionListItem>
         </ActionList>*/}
      </Form>
    </PageSection>
  );
};

export default Incidents;
