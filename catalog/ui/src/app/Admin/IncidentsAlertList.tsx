import React, { useReducer, useState } from 'react';
import {
  Button,
  Form,
  FormGroup,
  PageSection,
  PageSectionVariants,
  Select,
  SelectOption,
  Switch,
  TextArea,
} from '@patternfly/react-core';
import useSWR from 'swr';
import { apiPaths, fetcher } from '@app/api';
import LocalTimestamp from '@app/components/LocalTimestamp';
import { Incident } from '@app/types';
import { Caption, TableComposable, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import EditIcon from '@patternfly/react-icons/dist/js/icons/edit-icon';

import './admin.css';
import Modal, { useModal } from '@app/Modal/Modal';

type IncidentData = Omit<Incident, 'updated_at' | 'created_at'>;
const initialState: IncidentData = {
  id: null,
  message: '',
  level: 'info',
  incident_type: 'general',
  status: 'active',
};
function reducer(
  state: IncidentData,
  action: {
    type: 'clear_state' | 'edit_incident' | 'new_incident' | 'set_status' | 'set_message' | 'set_level';
    incident?: IncidentData;
    message?: string;
    status?: 'active' | 'resolved';
    level?: 'info' | 'critical' | 'warning';
  }
) {
  switch (action.type) {
    case 'clear_state': {
      return { ...initialState };
    }
    case 'edit_incident': {
      return {
        ...state,
        id: action.incident.id,
        incident_type: action.incident.incident_type,
        message: action.incident.message,
        status: action.incident.status,
      };
    }
    case 'new_incident': {
      return { ...initialState };
    }
    case 'set_message': {
      return { ...state, message: action.message };
    }
    case 'set_status': {
      return { ...state, message: action.status };
    }
    case 'set_level': {
      return { ...state, message: action.level };
    }
  }
}

const IncidentsAlertList: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isOpen, setIsOpen] = useState(false);
  const [incidentModal, openIncidentModal] = useModal();
  const { data: activeIncidents, mutate } = useSWR<Incident[]>(apiPaths.INCIDENTS({ status: 'active' }), fetcher, {
    refreshInterval: 8000,
  });

  async function upsertIncident(incident: IncidentData) {
    await fetcher(incident.id ? apiPaths.INCIDENT({ incidentId: incident.id }) : apiPaths.INCIDENTS({}), {
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        incident_type: incident.incident_type,
        status: incident.status,
        level: incident.level,
        message: incident.message,
      }),
    });

    mutate(undefined);
  }

  return (
    <PageSection key="body" variant={PageSectionVariants.light}>
      <Modal
        ref={incidentModal}
        onConfirm={async () => {
          await upsertIncident(state);
          dispatch({ type: 'clear_state' });
        }}
        onClose={() => {
          dispatch({ type: 'clear_state' });
        }}
        title="Edit Incident"
        confirmText="Save"
      >
        <Form className="incidents__form">
          <FormGroup fieldId="message" isRequired={true} label="Message">
            <TextArea
              id="message"
              onChange={(v) => dispatch({ type: 'set_message', message: v })}
              value={state.message}
              placeholder="Add message"
              aria-label="Add message"
              className="incidents__form-comment"
            />
          </FormGroup>
          <FormGroup fieldId="status" isRequired={true} label="Status">
            <div className="incidents__form-group-control--single">
              <Switch
                id="incidents__form-active"
                aria-label="Active"
                isChecked={state.status === 'active'}
                onChange={(v) => dispatch({ type: 'set_status', status: v ? 'active' : 'resolved' })}
              />
            </div>
          </FormGroup>
          <FormGroup fieldId="level" isRequired={true} label="Level">
            <div className="incidents__form-group-control--single">
              <Select
                aria-labelledby="level"
                aria-label="Level"
                selections={state.level}
                onToggle={(isOpen) => setIsOpen(isOpen)}
                isOpen={isOpen}
                onSelect={(ev, selection) =>
                  dispatch({
                    type: 'set_level',
                    level: selection.toString().toLowerCase() as 'info' | 'warning' | 'critical',
                  })
                }
              >
                <SelectOption key="info" value="Info" isPlaceholder />
                <SelectOption key="warning" value="Warning" />
                <SelectOption key="critical" value="Critical" />
              </Select>
            </div>
          </FormGroup>
        </Form>
      </Modal>
      <Button
        onClick={() => {
          dispatch({ type: 'new_incident' });
          openIncidentModal();
        }}
      >
        New incident
      </Button>
      <TableComposable aria-label="Active incidents">
        <Caption>Active incidents</Caption>
        <Thead>
          <Tr>
            <Th>Message</Th>
            <Th>Last updated</Th>
            <Th>Status</Th>
          </Tr>
        </Thead>
        <Tbody>
          {activeIncidents.map((incident) => (
            <Tr key={incident.id}>
              <Td dataLabel="message">{incident.message}</Td>
              <Td dataLabel="updated">
                <LocalTimestamp timestamp={incident.updated_at} />
              </Td>
              <Td dataLabel="status">{incident.status}</Td>
              <Td dataLabel="edit">
                <Button
                  variant="plain"
                  aria-label="edit"
                  onClick={() => {
                    dispatch({ type: 'edit_incident', incident });
                    openIncidentModal();
                  }}
                >
                  <EditIcon />
                </Button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </TableComposable>
    </PageSection>
  );
};

export default IncidentsAlertList;
