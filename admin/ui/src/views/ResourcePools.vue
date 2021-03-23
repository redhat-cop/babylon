<template>
  <h1>ResourcePools</h1>
  <p>{{ error }}</p>
  <table>
    <thead>
      <tr>
        <th>Namespace</th>
        <th>Name</th>
        <th>Min Available</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="resourcepool in resourcepools" v-bind:key="resourcepool.metadata.uid">
        <td>{{resourcepool.metadata.namespace}}</td>
        <td><router-link :to="'/r/resourcepool/' + resourcepool.metadata.namespace + '/' + resourcepool.metadata.name">{{resourcepool.metadata.name}}</router-link></td>
        <td>{{resourcepool.spec.minAvailable}}
          <button @click="scaleUpPool(resourcepool)">+</button>
          <button @click="scaleDownPool(resourcepool)">-</button>
        </td>
        <td><button @click="deletePool(resourcepool)">Delete</button></td>
      </tr>
    </tbody>
  </table>
</template>

<script>
export default {
  name: 'ResourcePools',
  data () {
    return {
      error: '',
      resourcepools: []
    }
  },
  created () {
    this.refresh()
  },
  methods: {
    deletePool (resourcepool) {
      if (confirm('Delete ResourcePool ' + resourcepool.metadata.name + '?')) {
        window.apiSession
        .then(session =>
          fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + resourcepool.metadata.namespace + '/resourcepools/' + resourcepool.metadata.name, {
            method: 'DELETE',
            headers: {
              'Authentication': 'Bearer ' + session.token,
            }
          })
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
        return fetch('/apis/poolboy.gpte.redhat.com/v1/resourcepools', {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        }); 
      })
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.resourcepools = data.items
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
    },
    scalePool(resourcepool, minAvailable) {
      window.apiSession
      .then(session =>
        fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + resourcepool.metadata.namespace + '/resourcepools/' + resourcepool.metadata.name, {
          method: 'PATCH',
          body: JSON.stringify({spec: {minAvailable: minAvailable}}),
          headers: {
            'Authentication': 'Bearer ' + session.token,
            'Content-Type': 'application/merge-patch+json'
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
    },
    scaleDownPool(resourcepool) {
      if (resourcepool.spec.minAvailable > 0) {
        this.scalePool(resourcepool, resourcepool.spec.minAvailable - 1)
      }
    },
    scaleUpPool(resourcepool) {
      this.scalePool(resourcepool, resourcepool.spec.minAvailable + 1)
    }
  }
}
</script>
