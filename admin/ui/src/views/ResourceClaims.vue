<template>
  <h1>ResourceClaims</h1>
  <p>{{ error }}</p>
  <table>
    <thead>
      <tr>
        <th>Namespace</th>
        <th>Name</th>
        <th>ResourceHandle</th>
        <th>AnarchySubject(s)</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="resourceclaim in resourceclaims" v-bind:key="resourceclaim.metadata.uid">
        <td>
          <a :href="this.consoleUrl + '/api-resource/ns/' + resourceclaim.metadata.namespace + '/poolboy.gpte.redhat.com~v1~ResourceClaim/instances'" target="_blank">{{resourceclaim.metadata.namespace}}</a>
        </td>
        <td>
          <router-link :to="'/r/resourceclaim/' + resourceclaim.metadata.namespace + '/' + resourceclaim.metadata.name">{{resourceclaim.metadata.name}}</router-link>
        </td>
        <td v-if="resourceclaim.status && resourceclaim.status.resourceHandle">
          <router-link :to="'/r/resourcehandle/' + resourceclaim.status.resourceHandle.namespace + '/' + resourceclaim.status.resourceHandle.name">{{resourceclaim.status.resourceHandle.name}}</router-link>
        </td>
        <td v-else></td>
        <td v-if="resourceclaim.status && resourceclaim.status.resources">
          <div v-for="resource in resourceclaim.status.resources" v-bind:key="resource.state.metadata.uid">
            <router-link :to="'/r/anarchysubject/' + resource.state.metadata.namespace + '/' + resource.state.metadata.name">{{resource.state.metadata.name}}</router-link>
          </div>
        </td>
        <td v-else></td>
        <td><button @click="deleteClaim(resourceclaim)">Delete</button></td>
      </tr>
    </tbody>
  </table>
</template>

<script>
export default {
  name: 'ResourceClaims',
  data () {
    return {
      consoleUrl: '',
      error: '',
      resourceclaims: []
    }
  },
  created () {
    window.consoleUrl.then(url => {
      this.consoleUrl = url
    });
    this.refresh();
  },
  methods: {
    deleteClaim (resourceclaim) {
      if (confirm('Delete ResourceClaim ' + resourceclaim.metadata.name + ' in ' + resourceclaim.metadata.namespace + '?')) {
        window.apiSession
        .then(session =>
          fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + resourceclaim.metadata.namespace + '/resourceclaims/' + resourceclaim.metadata.name, {
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
    refresh() {
      window.apiSession
      .then(session =>
        fetch('/apis/poolboy.gpte.redhat.com/v1/resourceclaims', {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        })
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.resourceclaims = data.items
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
