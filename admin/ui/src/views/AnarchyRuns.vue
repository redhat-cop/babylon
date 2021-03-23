<template>
  <h1>AnarchyRuns</h1>
  <p>{{error}}</p>
  <table v-if="anarchyRuns">
    <thead>
      <tr>
        <th>Namespace</th>
        <th>Name</th>
        <th>Runner</th>
        <th>AnarchyGovernor</th>
        <th>AnarchySubject</th>
        <th>AnarchyAction</th>
        <th>Age</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="anarchyRun in anarchyRuns" v-bind:key="anarchyRun.metadata.uid">
        <td>
          <a :href="this.consoleUrl + '/api-resource/ns/' + anarchyRun.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyRun/instances'" target="_blank">{{anarchyRun.metadata.namespace}}</a>
        </td>
        <td>
          <router-link :to="'/r/anarchyrun/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.name">{{anarchyRun.metadata.name}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchyRun.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyRun/' + anarchyRun.metadata.name" target="_blank">&#8599;</a>
        </td>
        <td>
          {{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/runner']}}
        </td>
        <td>
          <router-link :to="'/r/anarchygovernor/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/governor']">{{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/governor']}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchyRun.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyGovernor/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/governor']" target="_blank">&#8599;</a>
        </td>
        <td>
          <router-link :to="'/r/anarchysubject/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/subject']">{{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/subject']}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchyRun.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchySubject/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/subject']" target="_blank">&#8599;</a>
        </td>
        <td v-if="anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']">
          <router-link :to="'/r/anarchyaction/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']">{{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchyRun.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyAction/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']" target="_blank">&#8599;</a>
        </td>
        <td v-else>-</td>
        <td>{{anarchyRun.age}}</td>
        <td>
          <button @click="deleteAnarchyRun(anarchyRun)">Delete</button>
          <button v-if="'failed' == anarchyRun.metadata.labels['anarchy.gpte.redhat.com/runner']" @click="retryAnarchyRun(anarchyRun)">Retry</button>
          <button v-if="'queued' == anarchyRun.metadata.labels['anarchy.gpte.redhat.com/runner']" @click="forceRunAnarchyRun(anarchyRun)">Run</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script>
export default {
  name: 'AnarchyRuns',
  data () {
    return {
      consoleUrl: '',
      error: '',
      anarchyRuns: ''
    }
  },
  created () {
    window.consoleUrl.then(url => {
      this.consoleUrl = url
    });
    this.refresh();
  },
  methods: {
    deleteAnarchyRun (anarchyRun) {
      if (confirm('Delete AnarchyRun ' + anarchyRun.metadata.name + '?')) {
        window.apiSession
        .then(session =>
          fetch('/apis/anarchy.gpte.redhat.com/v1/namespaces/' + anarchyRun.metadata.namespace + '/anarchyruns/' + anarchyRun.metadata.name, {
            method: 'DELETE',
            headers: {
              'Authentication': 'Bearer ' + session.token,
            }
          })
        ).then(response => {
          if (response.status === 200) {
             this.refresh()
          } else if(response.status === 401) {
            this.error = 'Session expired, please refresh.'
          } else if(response.status === 403) {
            this.error = 'Sorry, it seems you do not have access.'
          } else {
            this.error = response.status
          }
        })
      }
    },
    forceRunAnarchyRun (anarchyRun) {
      if (confirm('Force run AnarchyRun ' + anarchyRun.metadata.name + '?')) {
        window.apiSession
        .then(session =>
          fetch('/apis/anarchy.gpte.redhat.com/v1/namespaces/' + anarchyRun.metadata.namespace + '/anarchyruns/' + anarchyRun.metadata.name, {
            method: 'PATCH',
            headers: {
              'Authentication': 'Bearer ' + session.token,
              'Content-Type': 'application/json-patch+json'
            },
            body: JSON.stringify([
              {
                'op': 'test',
                'path': '/metadata/labels/anarchy.gpte.redhat.com~1runner',
                'value': 'queued'
              },{
                'op': 'replace',
                'path': '/metadata/labels/anarchy.gpte.redhat.com~1runner',
                'value': 'pending'
              }
            ]),
          })
        ).then(response => {
          if (response.status === 200) {
             this.refresh()
          } else if(response.status === 401) {
            this.error = 'Session expired, please refresh.'
          } else if(response.status === 403) {
            this.error = 'Sorry, it seems you do not have access.'
          } else {
            this.error = response.status
          }
        })
      }
    },
    retryAnarchyRun (anarchyRun) {
      if (confirm('Retry AnarchyRun ' + anarchyRun.metadata.name + '?')) {
        window.apiSession
        .then(session =>
          fetch('/apis/anarchy.gpte.redhat.com/v1/namespaces/' + anarchyRun.metadata.namespace + '/anarchyruns/' + anarchyRun.metadata.name, {
            method: 'PATCH',
            headers: {
              'Authentication': 'Bearer ' + session.token,
              'Content-Type': 'application/json-patch+json'
            },
            body: JSON.stringify([
              {
                'op': 'test',
                'path': '/metadata/labels/anarchy.gpte.redhat.com~1runner',
                'value': 'failed'
              },{
                'op': 'replace',
                'path': '/metadata/labels/anarchy.gpte.redhat.com~1runner',
                'value': 'pending'
              }
            ]),
          })
        ).then(response => {
          if (response.status === 200) {
             this.refresh()
          } else if(response.status === 401) {
            this.error = 'Session expired, please refresh.'
          } else if(response.status === 403) {
            this.error = 'Sorry, it seems you do not have access.'
          } else {
            this.error = response.status
          }
        })
      }
    },
    refresh () {
      window.apiSession
      .then(session =>
        fetch('/apis/anarchy.gpte.redhat.com/v1/anarchyruns', {
          headers: {
            'Accept': 'application/json;as=Table;g=meta.k8s.io;v=v1beta1',
            'Authentication': 'Bearer ' + session.token
          }
        })
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            const anarchyRuns = []
            const columnIndex = [] 
            for (let i = 0; i < data.columnDefinitions.length; ++i) {
              const columnDefinition = data.columnDefinitions[i];
              columnIndex[columnDefinition.name] = i;
            }
            for (let i = 0; i < data.rows.length; ++i) {
              const row = data.rows[i];
              anarchyRuns.push({
                metadata: row.object.metadata,
                age: row.cells[columnIndex['Age']]
              })
            }
            this.anarchyRuns = anarchyRuns;
          })
        } else if(response.status === 401) {
          this.error = 'Session expired, please refresh.'
        } else if(response.status === 403) {
          this.error = 'Sorry, it seems you do not have access.'
        } else {
          this.error = response.status
        }
      })
      .catch(error => {
        this.error = error
      });
    }
  }
}
</script>
