import React, { useReducer, useState } from 'react';
import { Button, Form, FormGroup, Panel, PanelMain, Switch, Title } from '@patternfly/react-core';
import { Select, SelectOption } from '@patternfly/react-core/deprecated';
import { $generateHtmlFromNodes } from '@lexical/html';
import useSWR from 'swr';
import { apiPaths, fetcher } from '@app/api';
import { Incident } from '@app/types';
import { Table /* data-codemods */, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import EditIcon from '@patternfly/react-icons/dist/js/icons/edit-icon';
import Modal, { useModal } from '@app/Modal/Modal';
import PlusCircleIcon from '@patternfly/react-icons/dist/esm/icons/plus-circle-icon';
import TimeInterval from '@app/components/TimeInterval';
import InfoCircleIcon from '@patternfly/react-icons/dist/js/icons/info-circle-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import Editor from '@app/components/Editor/Editor';
import { EditorState, LexicalEditor } from 'lexical';
import EditorViewer from '@app/components/Editor/EditorViewer';

import './admin.css';
import useSession from '@app/utils/useSession';

type IncidentData = Omit<Incident, 'updated_at' | 'created_at'>;

const initialState: IncidentData = {
  id: null,
  message: '',
  interface: '',
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
    interface?: string;
  },
) {
  switch (action.type) {
    case 'clear_state': {
      return { ...initialState };
    }
    case 'edit_incident': {
      return {
        ...state,
        id: action.incident.id,
        level: action.incident.level,
        incident_type: action.incident.incident_type,
        message: action.incident.message,
        status: action.incident.status,
        interface: action.incident.interface
      };
    }
    case 'new_incident': {
      return { ...initialState, interface: action.interface };
    }
    case 'set_message': {
      return { ...state, message: action.message };
    }
    case 'set_status': {
      return { ...state, status: action.status };
    }
    case 'set_level': {
      return { ...state, level: action.level };
    }
  }
}

const IncidentsAlertList: React.FC = () => {
  const { userInterface } = useSession().getSession();
  const [state, dispatch] = useReducer(reducer, {... initialState, interface: userInterface});
  const [isOpen, setIsOpen] = useState(false);
  const [incidentModal, openIncidentModal] = useModal();
  const { data: activeIncidents, mutate } = useSWR<Incident[]>(apiPaths.INCIDENTS({ status: 'active', userInterface: userInterface }), fetcher, {
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
        interface: incident.interface
      }),
    });

    mutate();
  }

  return (
    <div>
      <Modal
        ref={incidentModal}
        onConfirm={async () => {
          await upsertIncident(state);
          dispatch({ type: 'clear_state' });
        }}
        onClose={() => {
          dispatch({ type: 'clear_state' });
        }}
        title={state.id ? 'Edit Incident' : 'New Incident'}
        confirmText="Save"
      >
        <Form className="incidents__form">
          <FormGroup fieldId="message" isRequired={true} label="Message">
            <Editor
              onChange={(_: EditorState, editor: LexicalEditor) => {
                editor.update(() => {
                  const html = $generateHtmlFromNodes(editor, null);
                  dispatch({ type: 'set_message', message: html });
                });
              }}
              defaultValue={state.message}
              placeholder="Add message"
            />
          </FormGroup>
          <FormGroup fieldId="status" isRequired={true} label="Status" hasNoPaddingTop>
            <div className="incidents__form-group-control--single">
              <Switch
                id="incidents__form-active"
                aria-label="Active"
                label="Active"
                labelOff="Resolved"
                isChecked={state.status === 'active'}
                onChange={(_event, v) => dispatch({ type: 'set_status', status: v ? 'active' : 'resolved' })}
              />
            </div>
          </FormGroup>
          <FormGroup fieldId="level" isRequired={true} label="Level" hasNoPaddingTop>
            <div className="incidents__form-group-control--single">
              <Select
                aria-labelledby="level"
                aria-label="Level"
                selections={state.level === 'info' ? 'Info' : state.level === 'warning' ? 'Warning' : 'Critical'}
                onToggle={(_event, isOpen) => setIsOpen(isOpen)}
                isOpen={isOpen}
                onSelect={(ev, selection) => {
                  dispatch({
                    type: 'set_level',
                    level: selection.toString().toLowerCase() as 'info' | 'warning' | 'critical',
                  });
                  setIsOpen(false);
                }}
              >
                <SelectOption key="info" value="Info" />
                <SelectOption key="warning" value="Warning" />
                <SelectOption key="critical" value="Critical" />
              </Select>
            </div>
          </FormGroup>
        </Form>
      </Modal>
      <Panel variant="raised">
        <div style={{ padding: 'var(--pf-v5-global--spacer--md)' }}>
          <Title headingLevel="h3" size="md">
            Active Incidents
          </Title>
          <Button
            onClick={() => {
              dispatch({ type: 'new_incident', interface: userInterface });
              openIncidentModal();
            }}
            icon={<PlusCircleIcon />}
            style={{
              marginLeft: 'auto',
              display: 'flex',
            }}
          >
            New incident
          </Button>
        </div>
        <PanelMain>
          {activeIncidents.length > 0 ? (
            <Table aria-label="Active incidents">
              <Thead>
                <Tr>
                  <Th>Level</Th>
                  <Th>Message</Th>
                  <Th>Status</Th>
                  <Th>Last updated</Th>
                  <Th>Edit</Th>
                </Tr>
              </Thead>
              <Tbody>
                {activeIncidents.map((incident) => (
                  <Tr key={incident.id}>
                    <Td
                      dataLabel="level"
                      style={{
                        textTransform: 'capitalize',
                        display: 'flex',
                        gap: 'var(--pf-v5-global--spacer--xs)',
                        alignItems: 'center',
                      }}
                    >
                      {incident.level === 'info' && <InfoCircleIcon />}
                      {incident.level === 'warning' && <ExclamationTriangleIcon />}
                      {incident.level === 'critical' && <ExclamationCircleIcon />}
                      {incident.level}
                    </Td>
                    <Td dataLabel="message">
                      <EditorViewer value={incident.message} />
                    </Td>
                    <Td dataLabel="status">{incident.status}</Td>
                    <Td dataLabel="updated">
                      <TimeInterval toTimestamp={incident.updated_at} />
                    </Td>
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
            </Table>
          ) : (
            <p style={{ padding: 'var(--pf-v5-global--spacer--md)' }}>No active incidents.</p>
          )}
        </PanelMain>
      </Panel>
    </div>
  );
};

export default IncidentsAlertList;
