import React, { useState, useEffect } from 'react';
import { Button, Spinner } from '@patternfly/react-core';
import { Dropdown, DropdownToggle, DropdownItem } from '@patternfly/react-core/deprecated';
import CaretDownIcon from '@patternfly/react-icons/dist/js/icons/caret-down-icon';
import {
  getOpenStackServersForResourceClaim,
  rebootOpenStackServer,
  startAllResourcesInResourceClaim,
  startOpenStackServer,
  startOpenStackServerConsoleSession,
  stopOpenStackServer,
} from '@app/api';

import { ResourceClaim } from '@app/types';

async function fetchOpenStackServers(resourceClaim, setOpenStackServers, setSelectedServer) {
  try {
    const resp = await getOpenStackServersForResourceClaim(resourceClaim);
    setOpenStackServers({ subjects: resp });
    setSelectedServer((s) => {
      let firstServer: any = {};
      if (resp && resp.length > 0 && resp[0].openStackServers[0]) {
        firstServer = resp[0].openStackServers[0];
      }
      return s || `${firstServer.project_id}.${firstServer.id}`;
    });
  } catch (err) {
    setOpenStackServers({ err: err });
  }
}

const ServiceOpenStackConsole: React.FC<{
  resourceClaim: ResourceClaim;
}> = ({ resourceClaim }) => {
  const [openStackServers, setOpenStackServers] = useState<any>([]);
  const [serverConsoleUrl, setServerConsoleUrl] = useState<string | null>(null);
  const [serverSelectIsOpen, setServerSelectIsOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [projectId, serverId] = selectedServer ? selectedServer.split('.') : [null, null];
  const serverState = (openStackServers?.subjects || [])
    .map((subject) => subject.openStackServers || [])
    .flat()
    .find((s) => s.id == serverId);

  useEffect(() => {
    fetchOpenStackServers(resourceClaim, setOpenStackServers, setSelectedServer);
  }, [resourceClaim]);
  useEffect(() => {
    if (selectedServer) {
      for (const subject of openStackServers?.subjects || []) {
        for (const server of subject.openStackServers || []) {
          if (server.id == serverId) {
            if (server.status === 'ACTIVE') {
              startOpenStackServerConsoleSession(resourceClaim, projectId, serverId).then((consoleSession) => {
                setServerConsoleUrl(consoleSession.console.url);
              });
            }
            break;
          }
        }
      }
    }
  }, [selectedServer]);
  useEffect(() => {
    if (serverState?.status === 'ACTIVE') {
      reconnectConsole();
    }
  }, [serverState?.status]);

  // Subjects must be started for console access
  const areAnySubjectsNotDesiredStarted = (resourceClaim?.status?.resources || []).some(
    (r) => r.state?.kind === 'AnarchySubject' && r.state?.spec?.vars.desired_state !== 'started',
  );
  const areAnySubjectsNotStarted = (resourceClaim?.status?.resources || []).some(
    (r) => r.state?.kind === 'AnarchySubject' && r.state?.spec?.vars.current_state !== 'started',
  );
  if (areAnySubjectsNotDesiredStarted) {
    return (
      <React.Fragment>
        <p>
          <Button onClick={() => startAllResourcesInResourceClaim(resourceClaim)}>
            Start service for console access
          </Button>
        </p>
      </React.Fragment>
    );
  } else if (areAnySubjectsNotStarted) {
    return (
      <React.Fragment>
        <p>
          Waiting for environment to start. <Spinner size="lg" />
        </p>
      </React.Fragment>
    );
  }

  const serverDropdownItems: any[] = [];
  for (const subject of openStackServers?.subjects || []) {
    for (const server of subject.openStackServers || []) {
      serverDropdownItems.push(
        <DropdownItem id={`${server.project_id}.${server.id}`} key={`${server.project_id}.${server.id}`}>
          {server.name}
        </DropdownItem>,
      );
    }
  }

  function onServerSelect(event) {
    const serverId = event?.target?.parentElement.id;
    setSelectedServer(serverId);
  }

  function rebootServer() {
    rebootOpenStackServer(resourceClaim, projectId, serverId).then(() => {
      setTimeout(reconnectConsole, 2000);
    });
  }

  function reconnectConsole() {
    startOpenStackServerConsoleSession(resourceClaim, projectId, serverId).then((consoleSession) => {
      setServerConsoleUrl(consoleSession.console.url);
    });
  }

  function startServer() {
    startOpenStackServer(resourceClaim, projectId, serverId);
  }

  function stopServer() {
    stopOpenStackServer(resourceClaim, projectId, serverId);
  }

  return (
    <React.Fragment>
      {serverDropdownItems.length > 1 ? (
        <Dropdown
          onSelect={onServerSelect}
          toggle={
            <DropdownToggle onToggle={() => setServerSelectIsOpen((v) => !v)} toggleIndicator={CaretDownIcon}>
              Select Server
            </DropdownToggle>
          }
          isOpen={serverSelectIsOpen}
          dropdownItems={serverDropdownItems}
        />
      ) : null}
      {serverState?.status === 'ACTIVE' ? (
        <Button variant="primary" onClick={stopServer}>
          Stop
        </Button>
      ) : serverState?.status === 'SHUTOFF' ? (
        <Button variant="primary" onClick={startServer}>
          Start
        </Button>
      ) : (
        <Button variant="primary" isDisabled={true}>
          Start
        </Button>
      )}{' '}
      <Button variant="primary" isDisabled={serverState?.status !== 'ACTIVE'} onClick={rebootServer}>
        Reboot
      </Button>{' '}
      <Button variant="primary" isDisabled={serverState?.status !== 'ACTIVE'} onClick={reconnectConsole}>
        Reconnect
      </Button>
      {serverConsoleUrl ? <iframe src={serverConsoleUrl} style={{ width: '100%', height: '800px' }}></iframe> : null}
    </React.Fragment>
  );
};

export default ServiceOpenStackConsole;
