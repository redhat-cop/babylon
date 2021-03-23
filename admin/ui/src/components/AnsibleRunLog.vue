<template>
  <div class="ansible-run-log" v-if="ansibleRun && ansibleRun.plays">
    <div class="ansible-run-log-play" v-for="(play, play_number) in ansibleRun.plays" :key="play_number">
      <div class="ansible-run-log-play-start">{{play.start.substring(0,19).replace('T',' ')}}</div>
      <div class="ansible-run-log-play-header">PLAY [{{play.name}}] *****</div>
      <div class="ansible-run-log-task" v-for="(task, task_number) in play.tasks" :key="task_number">
        <div class="ansible-run-log-task-start">{{task.start.substring(0,19).replace('T',' ')}}</div>
        <div class="ansible-run-log-task-header">TASK [{{task.name}}] *****</div>
        <div class="ansible-run-log-task-host" v-for="(host, hostname) in task.hosts" :key="hostname">
          <div class="ansible-run-log-task-host-items" v-if="host.items">
            <template v-for="(item, item_index) in host.items" :key="item_index">
              <div class="ansible-run-log-task-host-item-changed" v-if="item.result && item.result.changed">
                changed: [{{hostname}}] (item={{item.item}})
              </div>
              <div class="ansible-run-log-task-host-item-ok" v-else-if="item.ok">
                ok: [{{hostname}}] (item={{item.item}})
              </div>
              <div class="ansible-run-log-task-host-item-skipped" v-else-if="item.skipped">
                skipping: [{{hostname}}] (item={{item.item}})
              </div>
              <div class="ansible-run-log-task-host-item-failed" v-else-if="item.failed">
                fatal: [{{hostname}}] (item={{item.item}}): FAILED! =&gt;
                <div class="ansible-run-log-yaml-dump">{{ this.yamlDump({args: host.args || null, result: item.result})}}</div>
              </div>
              <div class="ansible-run-log-task-host-item-unknown" v-else>
                ??: {{hostname}} (item={{item.item}})
              </div>
            </template>
          </div>
          <div class="ansible-run-log-task-host-changed" v-else-if="host.result && host.result.changed">
            changed: [{{hostname}}]
          </div>
          <div class="ansible-run-log-task-host-ok" v-else-if="host.ok">
            ok: [{{hostname}}]
          </div>
          <div class="ansible-run-log-task-host-skipped" v-else-if="host.skipped">
            skipping: [{{hostname}}]
          </div>
          <div class="ansible-run-log-task-host-failed" v-else-if="host.failed">
            fatal: [{{hostname}}] =&gt;
            <div class="ansible-run-log-yaml-dump">{{ this.yamlDump(host)}}</div>
          </div>
          <div class="ansible-run-log-task-host-unknown" v-else>
            ??: {{hostname}}
          </div>
        </div>
      </div>
      <div class="ansible-run-log-play-recap">
        <div class="ansible-run-log-play-recap-header">PLAY RECAP *****</div>
        <div class="ansible-run-log-play-recap-host" v-for="(host, hostname) in play.stats" :key="host">
          
          <span :class="'ansible-run-log-' + (host.failures > 0 ? 'failed' : host.unreachable > 0 ? 'failed' : host.changed > 0 ? 'changed' : 'default')">{{hostname}}</span> :
          <span :class="'ansible-run-log-' + (host.ok > 0 ? 'ok' : 'default')"> ok={{host.ok}}</span>
          <span :class="'ansible-run-log-' + (host.changed > 0 ? 'changed' : 'default')"> changed={{host.changed}}</span>
          <span :class="'ansible-run-log-' + (host.unreachable > 0 ? 'failed' : 'default')"> unreachable={{host.unreachable}}</span>
          <span :class="'ansible-run-log-' + (host.failures > 0 ? 'failed' : 'default')"> failed={{host.failures}}</span>
          <span :class="'ansible-run-log-' + (host.skipped > 0 ? 'skipped' : 'default')"> skipped={{host.skipped}}</span>
          rescued={{host.rescued}}
          ignored={{host.ignored}}
        </div>
      </div>
    </div>
  </div>
  <div class="ansible-run-log" v-else>
  No log data available.
  </div>
</template>

<script>
import * as jsYaml from 'js-yaml'

export default {
  name: 'AnsibleRunLog',
  props: ['ansibleRun'],
  computed: {
  },
  methods: {
    yamlDump(obj) { return jsYaml.dump(obj) }
  }
}
</script>

<style>
.ansible-run-log {
  display: block;
  background-color: #f2f2f2;
  border-radius: 0 0 4px 4px;
  border: 1px solid #b7b7b7;
  display: flex;
  flex-direction: column;
  flex: 1;
  font-family: monospace;
  font-size: 15px;
  min-height: 600px;
  height: 100%;
  margin: 0;
  overflow-y: scroll;
  padding: 5px 10px;
}

.ansible-run-log-ok {
  color: #008800;
}

.ansible-run-log-changed {
  color: #f0ad4e;
}

.ansible-run-log-skipped {
  color: #00aaaa;
}

.ansible-run-log-failed {
  color: #aa0000;
}

.ansible-run-log-play {
  display: block;
  width: 100%;
  margin-top: 10px;
}

.ansible-run-log-play-header {
  display: block;
  text-align: left;
}
.ansible-run-log-play-start {
  display: block;
  text-align: right;
  float: right;
  font-size: 80%;
  background-color: #ffffff;
  padding: 2px;
}
.ansible-run-log-task-header {
  display: block;
  text-align: left;
  margin-top: 10px;
}
.ansible-run-log-task-start {
  display: block;
  text-align: right;
  float: right;
  font-size: 80%;
  background-color: #ffffff;
  padding: 2px;
}
.ansible-run-log-task-host-changed {
  display: block;
  text-align: left;
  color: #f0ad4e;
}
.ansible-run-log-task-host-ok {
  display: block;
  text-align: left;
  color: #008800;
}
.ansible-run-log-task-host-skipped {
  display: block;
  text-align: left;
  color: #00aaaa;
}
.ansible-run-log-task-host-failed {
  display: block;
  text-align: left;
  color: #aa0000;
}
.ansible-run-log-task-host-unknown {
  display: block;
  background-color: #333333;
  font-weight: bold;
  text-align: left;
  color: #ff0000;
}
.ansible-run-log-task-host-item-changed {
  display: block;
  text-align: left;
  color: #f0ad4e;
}
.ansible-run-log-task-host-item-ok {
  display: block;
  text-align: left;
  color: #008800;
}
.ansible-run-log-task-host-item-skipped {
  display: block;
  text-align: left;
  color: #00aaaa;
}
.ansible-run-log-task-host-item-failed {
  display: block;
  text-align: left;
  color: #aa0000;
}
.ansible-run-log-task-host-item-unknown {
  display: block;
  background-color: #333333;
  font-weight: bold;
  text-align: left;
  color: #ff0000;
}
.ansible-run-log-play-recap {
  display: block;
  text-align: left;
  margin-top: 10px;
}

.ansible-run-log-yaml-dump {
  display: block;
  white-space: pre;
  margin-left: 20px;
  margin-top: 5px;
  margin-bottom: 5px;
}
</style>
