<template>
  <h1>ResourceProviders</h1>
  <p>{{ error }}</p>
  <table>
    <thead>
      <tr>
        <th>Namespace</th>
        <th>Name</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="resourceprovider in resourceproviders" v-bind:key="resourceprovider.metadata.uid">
        <td>{{resourceprovider.metadata.namespace}}</td>
        <td><router-link :to="'/r/resourceprovider/' + resourceprovider.metadata.namespace + '/' + resourceprovider.metadata.name">{{resourceprovider.metadata.name}}</router-link></td>
      </tr>
    </tbody>
  </table>
</template>

<script>
export default {
  name: 'ResourceProviders',
  data () {
    return {
      error: '',
      resourceproviders: []
    }
  },
  created () {
    window.apiSession
    .then(session => {
      return fetch('/apis/poolboy.gpte.redhat.com/v1/resourceproviders', {
        headers: {
          'Authentication': 'Bearer ' + session.token
        }
      }); 
    })
    .then(response => {
      if (response.status === 200) {
        response.json().then(data => {
          this.resourceproviders = data.items
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
}
</script>
