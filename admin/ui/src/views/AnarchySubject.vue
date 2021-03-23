<template>
  <h1>
    AnarchySubject {{this.$route.params.name}}
    <a :href="this.consoleUrl + '/k8s/ns/' + this.$route.params.namespace + '/anarchy.gpte.redhat.com~v1~AnarchySubject/' + this.$route.params.name" target="_blank">&#8599;</a>
  </h1>
  <p>{{error}}</p>
  <template v-if="anarchySubject">
    <p v-if="anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']">
      <router-link :to="'/r/resourcehandle/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-namespace'] + '/' +  anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']">ResourceHandle {{anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']}}</router-link>
    </p>
    <p v-if="anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']">
      <router-link :to="'/r/resourceclaim/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace'] + '/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']">ResourceClaim {{anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']}}</router-link>
    </p>

    <h2>AnarchyActions</h2>
    <table v-if="anarchyActions && anarchyActions.length > 0">
      <thead>
        <tr>
          <th>Name</th>
          <th>AnarchyRun</th>
          <th>Creation</th>
          <th>Run Scheduled</th>
          <th>Finished</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="anarchyAction in anarchyActions" :key="anarchyAction.metadata.uid">
          <td>
            <router-link :to="'/r/anarchyaction/' + anarchyAction.metadata.namespace + '/' + anarchyAction.metadata.name">{{anarchyAction.metadata.name}}</router-link>
            <a :href="this.consoleUrl + '/k8s/ns/' + anarchyAction.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyAction/' + anarchyAction.metadata.name" target="_blank">&#8599;</a>
          </td>
          <td v-if="anarchyAction.metadata.labels['anarchy.gpte.redhat.com/run']">
            <router-link :to="'/r/anarchyrun/' + anarchyAction.metadata.namespace + '/' + anarchyAction.metadata.labels['anarchy.gpte.redhat.com/run']">{{anarchyAction.metadata.labels['anarchy.gpte.redhat.com/run']}}</router-link>
            <a :href="this.consoleUrl + '/k8s/ns/' + anarchyAction.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyRun/' + anarchyAction.metadata.labels['anarchy.gpte.redhat.com/run']" target="_blank">&#8599;</a>
          </td>
          <td v-else>-</td>
          <td>{{anarchyAction.metadata.creationTimestamp}}</td>
          <td v-if="anarchyAction.status && anarchyAction.status.runScheduled">{{anarchyAction.status.runScheduled}}</td>
          <td v-else>-</td>
          <td v-if="anarchyAction.status && anarchyAction.status.finishedTimestamp">{{anarchyAction.status.finishedTimestamp}}</td>
          <td v-else>-</td>
          <td>
            <button @click="deleteAnarchyAction(anarchyAction)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else>No AnarchyActions found.</div>

    <h2>AnarchyRuns</h2>
    <table v-if="anarchyRuns && anarchyRuns.length > 0">
      <thead>
        <tr>
          <th>Name</th>
          <th>Runner</th>
          <th>AnarchyAction</th>
          <th>Creation</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="anarchyRun in anarchyRuns" :key="anarchyRun.metadata.uid">
          <td>
            <router-link :to="'/r/anarchyrun/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.name">{{anarchyRun.metadata.name}}</router-link>
            <a :href="this.consoleUrl + '/k8s/ns/' + anarchyRun.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyRun/' + anarchyRun.metadata.name" target="_blank">&#8599;</a>
          </td>
          <td>
            {{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/runner']}}
          </td>
          <td v-if="anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']">
            <router-link :to="'/r/anarchyaction/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']">{{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']}}</router-link>
            <a :href="this.consoleUrl + '/k8s/ns/' + anarchyRun.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyAction/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']" target="_blank">&#8599;</a>
          </td>
          <td v-else>-</td>
          <td>{{anarchyRun.metadata.creationTimestamp}}</td>
          <td>
            <button @click="deleteAnarchyRun(anarchyRun)">Delete</button>
            <button v-if="'failed' == anarchyRun.metadata.labels['anarchy.gpte.redhat.com/runner']" @click="retryAnarchyRun(anarchyRun)">Retry</button>
            <button v-if="'queued' == anarchyRun.metadata.labels['anarchy.gpte.redhat.com/runner']" @click="forceRunAnarchyRun(anarchyRun)">Run</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else>No AnarchyRuns found.</div>

    <h2>Definition</h2>
    <YamlBlob :obj='anarchySubject'/>
  </template>
</template>

<script>
import YamlBlob from '@/components/YamlBlob.vue'

export default {
  name: 'AnarchySubject',
  components: {
    YamlBlob
  },
  data () {
    return {
      consoleUrl: '',
      error: '',
      anarchySubject: null,
      anarchyActions: null,
      anarchyRuns: null
    }
  },
  created () {
    window.consoleUrl.then(url => {
      this.consoleUrl = url
    });
    this.refresh();
    this.refreshAnarchyActions();
    this.refreshAnarchyRuns();
  },
  methods: {
    deleteAnarchyAction (anarchyAction) {
      if (confirm('Delete AnarchyAction ' + anarchyAction.metadata.name + '?')) {
        window.apiSession
        .then(session =>
          fetch('/apis/anarchy.gpte.redhat.com/v1/namespaces/' + anarchyAction.metadata.namespace + '/anarchyactions/' + anarchyAction.metadata.name, {
            method: 'DELETE',
            headers: {
              'Authentication': 'Bearer ' + session.token,
            }
          })
        ).then(response => {
          if (response.status === 200) {
             this.refreshAnarchyActions();
             setTimeout(function () { this.refreshAnarchyRuns() }, 100);
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
             this.refreshAnarchyRuns()
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
            ])
          })
        ).then(response => {
          if (response.status === 200) {
             this.refreshAnarchyRuns()
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
        fetch('/apis/anarchy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/anarchysubjects/' + this.$route.params.name, {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        })
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.anarchySubject = data
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
    },
    refreshAnarchyActions () {
      window.apiSession
      .then(session =>
        fetch(
          '/apis/anarchy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace +
          '/anarchyactions?labelSelector=anarchy.gpte.redhat.com%2Fsubject%3D' + this.$route.params.name,
          {
            headers: {
              'Authentication': 'Bearer ' + session.token
            }
          }
        )
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.anarchyActions = data.items
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
    },
    refreshAnarchyRuns () {
      window.apiSession
      .then(session =>
        fetch(
          '/apis/anarchy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace +
          '/anarchyruns?labelSelector=anarchy.gpte.redhat.com%2Fsubject%3D' + this.$route.params.name,
          {
            headers: {
              'Authentication': 'Bearer ' + session.token
            }
          }
        )
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.anarchyRuns = data.items
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
