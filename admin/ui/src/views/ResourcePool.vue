<template>
  <h1>ResourcePool {{$route.params.name}}</h1>
  <p>{{error}}</p>
  <h2>ResourceHandles</h2>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>ResourceClaim</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="resourcehandle in resourcehandles" v-bind:key="resourcehandle.metadata.uid">
        <td><router-link :to="'/r/resourcehandle/' + resourcehandle.metadata.namespace + '/' + resourcehandle.metadata.name">{{resourcehandle.metadata.name}}</router-link></td>
        <td v-if="resourcehandle.spec.resourceClaim"><router-link :to="'/r/resourceclaim/' + resourcehandle.spec.resourceClaim.namespace + '/' + resourcehandle.spec.resourceClaim.name">{{resourcehandle.spec.resourceClaim.namespace}}/{{resourcehandle.spec.resourceClaim.name}}</router-link></td>
        <td v-else></td>
        <td><button @click="deleteHandle(resourcehandle)">Delete</button></td>
      </tr>
    </tbody>
  </table>
  <h2>Definition</h2>
  <YamlBlob :obj='resourcepool'/>
</template>

<script>
import YamlBlob from '@/components/YamlBlob.vue'

export default {
  name: 'ResourcePool',
  components: {
    YamlBlob
  },
  data () {
    return {
      error: '',
      resourcepool: '',
      resourcehandles: []
    }
  },
  created () {
    window.apiSession
    .then(session =>
      fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/resourcepools/' + this.$route.params.name, {
        headers: {
          'Authentication': 'Bearer ' + session.token
        }
      })
    )
    .then(response => {
      if (response.status === 200) {
        response.json().then(data => {
          this.resourcepool = data
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
    this.refreshHandles()
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
             setTimeout(() => { this.refreshHandles() }, 500)
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
    refreshHandles () {
      window.apiSession
      .then(session =>
        fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/resourcehandles?labelSelector=poolboy.gpte.redhat.com%2Fresource-pool-name%3D' + this.$route.params.name, {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        }) 
      )
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
  }
}
</script>
