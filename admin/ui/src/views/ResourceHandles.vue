<template>
  <h1>ResourceHandles</h1>
  <p>{{ error }}</p>
  <table>
    <thead>
      <tr>
        <th>Namespace</th>
        <th>Name</th>
        <th>ResourcePool</th>
        <th>ResourceClaim</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="resourcehandle in resourcehandles" v-bind:key="resourcehandle.metadata.uid">
        <td>{{resourcehandle.metadata.namespace}}</td>
        <td><router-link :to="'/r/resourcehandle/' + resourcehandle.metadata.namespace + '/' + resourcehandle.metadata.name">{{resourcehandle.metadata.name}}</router-link></td>
        <td v-if="resourcehandle.spec.resourcePool"><router-link :to="'/r/resourcepool/' + resourcehandle.spec.resourcePool.namespace + '/' + resourcehandle.spec.resourcePool.name">{{resourcehandle.spec.resourcePool.name}}</router-link></td>
        <td v-else>none</td>
        <td v-if="resourcehandle.spec.resourceClaim"><router-link :to="'/r/resourceclaim/' + resourcehandle.spec.resourceClaim.namespace + '/' + resourcehandle.spec.resourceClaim.name">{{resourcehandle.spec.resourceClaim.namespace}}/{{resourcehandle.spec.resourceClaim.name}}</router-link></td>
        <td v-else>none</td>
        <td><button @click="deleteHandle(resourcehandle)">Delete</button></td>
      </tr>
    </tbody>
  </table>
</template>

<script>
export default {
  name: 'ResourceHandles',
  data () {
    return {
      error: '',
      resourcehandles: []
    }
  },
  created () {
    this.refresh()
  },
  methods: {
    deleteHandle (resourcehandle) {
      if (confirm(
        resourcehandle.spec.resourceClaim ?
        'Delete ResourceClaim ' + resourcehandle.spec.resourceClaim.name + ' in namespace ' + resourcehandle.spec.resourceClaim.namespace + '?':
        'Delete ResourceHandle ' + resourcehandle.metadata.name + '?'
      )) {
        window.apiSession
        .then(session =>
          fetch(
            resourcehandle.spec.resourceClaim ?
            '/apis/poolboy.gpte.redhat.com/v1/namespaces/' + resourcehandle.spec.resourceClaim.namespace + '/resourceclaims/' + resourcehandle.spec.resourceClaim.name :
            '/apis/poolboy.gpte.redhat.com/v1/namespaces/' + resourcehandle.metadata.namespace + '/resourcehandles/' + resourcehandle.metadata.name,
            {
              method: 'DELETE',
              headers: {
                'Authentication': 'Bearer ' + session.token,
              }
            }
          )
        ).then(response => {
          if (response.status === 200) {
             setTimeout(() => { this.refresh() }, 500)
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
      .then(session => {
        return fetch('/apis/poolboy.gpte.redhat.com/v1/resourcehandles', {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        }); 
      })
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.resourcehandles = data.items
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
      })
    }
  },
}
</script>
