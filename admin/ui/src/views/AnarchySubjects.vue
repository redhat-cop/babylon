<template>
  <h1>AnarchySubjects</h1>
  <p>{{error}}</p>
  <table>
    <thead>
      <tr>
        <th>Namespace</th>
        <th>Name</th>
        <th>Governor</th>
        <th>ResourceHandle</th>
        <th>ResourceClaim</th>
        <th>Current State</th>
        <th>Desired State</th>
        <th>Created</th>
        <th>Deleted</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="anarchySubject in anarchySubjects" v-bind:key="anarchySubject.metadata.uid">
        <td>
          <a :href="this.consoleUrl + '/api-resource/ns/' + anarchySubject.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchySubject/instances'" target="_blank">{{anarchySubject.metadata.namespace}}</a>
        </td>
        <td>
          <router-link :to="'/r/anarchysubject/' + anarchySubject.metadata.namespace + '/' + anarchySubject.metadata.name">{{anarchySubject.metadata.name}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchySubject.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchySubject/' + anarchySubject.metadata.name" target="_blank">&#8599;</a>
        </td>
        <td>
          <router-link :to="'/r/anarchygovernor/' + anarchySubject.metadata.namespace + '/' + anarchySubject.spec.governor">{{anarchySubject.spec.governor}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchySubject.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyGovernor/' + anarchySubject.spec.governor" target="_blank">&#8599;</a>
        </td>
        <td>
          <template v-if="anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']">
            <router-link :to="'/r/resourcehandle/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-namespace'] + '/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']">{{anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']}}</router-link>
            <a :href="this.consoleUrl + '/k8s/ns/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-namespace'] + '/poolboy.gpte.redhat.com~v1~ResourceHandle/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-handle-name']" target="_blank">&#8599;</a>
          </template>
          <template v-else>-</template>
        </td>
        <td>
          <template v-if="anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']">
            <router-link :to="'/r/resourceclaim/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace'] + '/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']">{{anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']}}</router-link>
            <a :href="this.consoleUrl + '/k8s/ns/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-namespace'] + '/poolboy.gpte.redhat.com~v1~ResourceClaim/' + anarchySubject.metadata.annotations['poolboy.gpte.redhat.com/resource-claim-name']" target="_blank">&#8599;</a>
          </template>
          <template v-else>-</template>
        </td>
        <td>{{anarchySubject.spec.vars.current_state}}</td>
        <td>{{anarchySubject.spec.vars.desired_state}}</td>
        <td>{{anarchySubject.metadata.creationTimestamp}}</td>
        <td v-if="anarchySubject.metadata.deletionTimestamp">{{anarchySubject.metadata.deletionTimestamp}}</td>
        <td v-else>-</td>
        <td>
          <template button v-if="'destroy-failed' == anarchySubject.spec.vars.current_state || 'destroy-canceled' == anarchySubject.spec.vars.current_state">
            <button @click="retryDestroyAnarchySubject(anarchySubject)">Retry Destroy</button>
            <button @click="removeFinalizersOnAnarchySubject(anarchySubject)">Remove Finalizers</button>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script>
export default {
  name: 'AnarchySubjects',
  data () {
    return {
      consoleUrl: '',
      error: '',
      anarchySubjects: []
    }
  },
  created () {
    window.consoleUrl.then(url => {
      this.consoleUrl = url
    });
    this.refresh();
  },
  methods: {
    removeFinalizersOnAnarchySubject (anarchySubject) {
      if (confirm('Remove finalizers from AnarchySubject ' + anarchySubject.metadata.name + '?')) {
        window.apiSession
        .then(session =>
          fetch('/apis/anarchy.gpte.redhat.com/v1/namespaces/' + anarchySubject.metadata.namespace + '/anarchysubjects/' + anarchySubject.metadata.name, {
            method: 'PATCH',
            headers: {
              'Authentication': 'Bearer ' + session.token,
              'Content-Type': 'application/json-patch+json'
            },
            body: JSON.stringify([
              {
                'op': 'remove',
                'path': '/metadata/finalizers'
              }
            ])
          })
        ).then(response => {
          if (response.status === 200) {
            this.refresh()
          } else {
            response.json().then(errorBody => {
              this.error = errorBody.message
            })
          }
        })
        .catch(error => {
          this.error = error
        })

      }
    },
    retryDestroyAnarchySubject (anarchySubject) {
      if (confirm('Retry destroy AnarchySubject ' + anarchySubject.metadata.name + '?')) {
        const anarchyAction = {
          apiVersion: 'anarchy.gpte.redhat.com/v1',
          kind: 'AnarchyAction',
          metadata: {
            generateName: anarchySubject.metadata.name + '-destroy-',
            namespace: anarchySubject.metadata.namespace
          },
          spec: {
            action: 'destroy',
            callbackToken: Math.random().toString(36).substring(7),
            subjectRef: {
              name: anarchySubject.metadata.name
            }
          }
        };
        window.apiSession
        .then(session =>
          fetch('/apis/anarchy.gpte.redhat.com/v1/namespaces/' + anarchyAction.metadata.namespace + '/anarchyactions', {
            method: 'POST',
            body: JSON.stringify(anarchyAction),
            headers: {
              'Authentication': 'Bearer ' + session.token,
              'Content-Type': 'application/json'
            }
          })
        ).then(response => {
          if (response.status === 201 || response.status === 200) {
            response.json().then(anarchyAction =>
              this.$router.push('/r/anarchyaction/' + anarchyAction.metadata.namespace + '/' + anarchyAction.metadata.name)
            )
          } else {
            response.json().then(errorBody => {
              this.error = errorBody.message
            })
          }
        })
        .catch(error => {
          this.error = error
        })
      }
    },
    refresh () {
      window.apiSession
      .then(session =>
        fetch('/apis/anarchy.gpte.redhat.com/v1/anarchysubjects', {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        })
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.anarchySubjects = data.items
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
