<template>
  <h1>AnarchyActions</h1>
  <p>{{error}}</p>
  <table v-if="anarchyActions">
    <thead>
      <tr>
        <th>Namespace</th>
        <th>Name</th>
        <th>AnarchyGovernor</th>
        <th>AnarchySubject</th>
        <th>AnarchyRun</th>
        <th>Age</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="anarchyAction in anarchyActions" v-bind:key="anarchyAction.metadata.uid">
        <td>
          <a :href="this.consoleUrl + '/api-resource/ns/' + anarchyAction.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyAction/instances'" target="_blank">{{anarchyAction.metadata.namespace}}</a>
        </td>
        <td>
          <router-link :to="'/r/anarchyaction/' + anarchyAction.metadata.namespace + '/' + anarchyAction.metadata.name">{{anarchyAction.metadata.name}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchyAction.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyAction/' + anarchyAction.metadata.name" target="_blank">&#8599;</a>
        </td>
        <td>
          <router-link :to="'/r/anarchygovernor/' + anarchyAction.metadata.namespace + '/' + anarchyAction.metadata.labels['anarchy.gpte.redhat.com/governor']">{{anarchyAction.metadata.labels['anarchy.gpte.redhat.com/governor']}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchyAction.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyGovernor/' + anarchyAction.metadata.labels['anarchy.gpte.redhat.com/governor']" target="_blank">&#8599;</a>
        </td>
        <td>
          <router-link :to="'/r/anarchysubject/' + anarchyAction.metadata.namespace + '/' + anarchyAction.metadata.labels['anarchy.gpte.redhat.com/subject']">{{anarchyAction.metadata.labels['anarchy.gpte.redhat.com/subject']}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchyAction.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyGovernor/' + anarchyAction.metadata.labels['anarchy.gpte.redhat.com/subject']" target="_blank">&#8599;</a>
        </td>
        <td v-if="anarchyAction.metadata.labels['anarchy.gpte.redhat.com/run']">
          <router-link :to="'/r/anarchyrun/' + anarchyAction.metadata.namespace + '/' + anarchyAction.metadata.labels['anarchy.gpte.redhat.com/run']">{{anarchyAction.metadata.labels['anarchy.gpte.redhat.com/run']}}</router-link>
          <a :href="this.consoleUrl + '/k8s/ns/' + anarchyAction.metadata.namespace + '/anarchy.gpte.redhat.com~v1~AnarchyRun/' + anarchyAction.metadata.labels['anarchy.gpte.redhat.com/run']" target="_blank">&#8599;</a>
        </td>
        <td v-else>-</td>
        <td>{{anarchyAction.age}}</td>
        <td>
          <button @click="deleteAnarchyAction(anarchyAction)">Delete</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script>
export default {
  name: 'AnarchyActions',
  data () {
    return {
      consoleUrl: '',
      error: '',
      anarchyActions: null
    }
  },
  created () {
    window.consoleUrl.then(url => {
      this.consoleUrl = url
    });
    this.refresh();
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
        fetch('/apis/anarchy.gpte.redhat.com/v1/anarchyactions', {
          headers: {
            'Accept': 'application/json;as=Table;g=meta.k8s.io;v=v1beta1',
            'Authentication': 'Bearer ' + session.token
          }
        })
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            const anarchyActions = []
            const columnIndex = [] 
            for (let i = 0; i < data.columnDefinitions.length; ++i) {
              const columnDefinition = data.columnDefinitions[i];
              columnIndex[columnDefinition.name] = i;
            }
            for (let i = 0; i < data.rows.length; ++i) {
              const row = data.rows[i];
              anarchyActions.push({
                metadata: row.object.metadata,
                age: row.cells[columnIndex['Age']]
              })
            }
            this.anarchyActions = anarchyActions;
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
