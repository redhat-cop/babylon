import React from 'react';
import yaml from 'js-yaml';

import './ansible-run-log.css';

export interface AnsibleRunTaskHost {
  args?: any;
  failed?: boolean;
  items?: any[];
  ok?: boolean;
  result?: any;
  skipped?: boolean;
}

export interface AnsibleRunTaskHosts {
  [key: string]: AnsibleRunTaskHost;
}

export interface AnsibleRunTask {
  name?: string;
  start: string;
  hosts: AnsibleRunTaskHosts;
}

export interface AnsibleRunPlayStatsHost {
  changed: number;
  failures: number;
  ignored: number;
  ok: number;
  rescued: number;
  skipped: number;
  unreachable: number;
}

export interface AnsibleRunPlayStats {
  [key: string]: AnsibleRunPlayStatsHost;
}

export interface AnsibleRunPlay {
  name?: string;
  start: string;
  stats: AnsibleRunPlayStats;
  tasks?: AnsibleRunTask[];
}

export interface AnsibleRun {
  plays: AnsibleRunPlay[];
}

export interface AnsibleRunLogProps {
  ansibleRun: AnsibleRun;
}

const AnsibleRunLog: React.FunctionComponent<AnsibleRunLogProps> = ({ ansibleRun }) => {
  return (
    <div className="ansible-run-log">
      {(ansibleRun.plays || []).map((play, play_number) => (
        <div key={play_number} className="ansible-run-log-play">
          <div className="ansible-run-log-play-start">{play.start.substring(0, 19)}Z</div>
          <div className="ansible-run-log-play-header">PLAY [{play.name}] *****</div>
          {(play.tasks || []).map((task, task_number) => (
            <div key={task_number} className="ansible-run-log-task">
              <div className="ansible-run-log-task-start">{task.start.substring(0, 19)}Z</div>
              <div className="ansible-run-log-task-header">TASK [{task.name}] *****</div>
              {Object.entries(task.hosts || {}).map(([hostname, host]) => (
                <div key={hostname} className="ansible-run-log-task-host">
                  {(host.items || []).length > 0 ? (
                    <div className="ansible-run-log-task-host-items">
                      {host.items.map((item: any, item_number) =>
                        item.result?.changed ? (
                          <div key={item_number} className="ansible-run-log-task-host-item-changed">
                            changed: [{hostname}] (item={item.item})
                          </div>
                        ) : item.ok ? (
                          <div key={item_number} className="ansible-run-log-task-host-item-ok">
                            ok: [{hostname}] (item={item.item})
                          </div>
                        ) : item.skipped ? (
                          <div key={item_number} className="ansible-run-log-task-host-item-skipped">
                            skipping: [{hostname}] (item={item.item})
                          </div>
                        ) : item.failed ? (
                          <div key={item_number} className="ansible-run-log-task-host-item-failed">
                            fatal: [{hostname}] (item={item.item}): FAILED! =&gt;
                            <div className="ansible-run-log-yaml-dump">
                              {yaml.dump({ args: host.args, result: item.result })}
                            </div>
                          </div>
                        ) : (
                          <div key={item_number} className="ansible-run-log-task-host-unknown">
                            ??: {hostname}
                          </div>
                        )
                      )}
                    </div>
                  ) : host.result?.changed ? (
                    <div className="ansible-run-log-task-host-changed">changed: [{hostname}]</div>
                  ) : host.ok ? (
                    <div className="ansible-run-log-task-host-ok">ok: [{hostname}]</div>
                  ) : host.skipped ? (
                    <div className="ansible-run-log-task-host-skipped">skipping: [{hostname}]</div>
                  ) : host.failed ? (
                    <div className="ansible-run-log-task-host-failed">
                      fatal: [{hostname}] =&gt;
                      <div className="ansible-run-log-yaml-dump">{yaml.dump(host)}</div>
                    </div>
                  ) : (
                    <div className="ansible-run-log-task-host-unknown">??: {hostname}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="ansible-run-log-play-recap">
            <div className="ansible-run-log-play-recap-header">PLAY RECAP *****</div>
            {Object.entries(play.stats || {}).map(([hostname, host]) => (
              <div key={hostname} className="ansible-run-log-play-recap-host">
                <span
                  className={`ansible-run-log-${
                    host.failures > 0
                      ? 'failed'
                      : host.unreachable > 0
                      ? 'failed'
                      : host.changed > 0
                      ? 'changed'
                      : 'default'
                  }`}
                >
                  {hostname}
                </span>{' '}
                :<span className={`ansible-run-log-${host.ok > 0 ? 'ok' : 'default'}`}> ok={host.ok}</span>
                <span className={`ansible-run-log-${host.changed > 0 ? 'changed' : 'default'}`}>
                  {' '}
                  changed={host.changed}
                </span>
                <span className={`ansible-run-log-${host.unreachable > 0 ? 'failed' : 'default'}`}>
                  {' '}
                  unreachable={host.unreachable}
                </span>
                <span className={`ansible-run-log-${host.failures > 0 ? 'failed' : 'default'}`}>
                  {' '}
                  failed={host.failures}
                </span>
                <span className={`ansible-run-log-${host.skipped > 0 ? 'skipped' : 'default'}`}>
                  {' '}
                  skipped={host.skipped}
                </span>{' '}
                rescued={host.rescued} ignored={host.ignored}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AnsibleRunLog;
