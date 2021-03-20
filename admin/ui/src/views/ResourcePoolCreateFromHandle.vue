<template>
  <h1>Create ResourcePool from ResourceHandle {{$route.params.name}}</h1>
  <p>{{ error }}</p>
  <div><textarea class="yaml-input" v-model="resourcepool_yaml"></textarea></div>
  <button @click="create">Create</button>
</template>

<script>
import * as jsYaml from 'js-yaml'

export default {
  name: 'ResourcePoolCreateFromHandle',
  data () {
    return {
      error: '',
      resourcepool_yaml: ''
    }
  },
  created () {
    window.apiSession
    .then(session => 
      fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/resourcehandles/' + this.$route.params.name, {
        headers: {
          'Authentication': 'Bearer ' + session.token
        }
      }) 
    )
    .then(response => {
      if (response.status === 200) {
        response.json().then(data => {
          let poolName = data.spec.resources[0].template.metadata.generateName.slice(0, -1)
          let resourcepool = {
            apiVersion: data.apiVersion,
            kind: 'ResourcePool',
            metadata: {
              namespace: data.metadata.namespace,
              name: poolName
            },
            spec: {
              minAvailable: 1,
              resources: data.spec.resources
            }
          };
          delete resourcepool.spec.resourceClaim;
          delete resourcepool.spec.resourcePool;
          resourcepool.spec.resources.forEach(item => {
            delete item.reference
          })
          this.resourcepool_yaml = jsYaml.dump(resourcepool, {noArrayIndent: true});
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
  methods: {
    create () {
      const resourcepool = jsYaml.load(this.resourcepool_yaml)
      if (resourcepool.metadata.name == '<NAME>') {
         alert('Please replace <NAME> with a valid pool name.')
         return
      }
      window.apiSession
      .then(session =>
        fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + resourcepool.metadata.namespace + '/resourcepools', {
          method: 'POST',
          body: JSON.stringify(resourcepool),
          headers: {
            'Authentication': 'Bearer ' + session.token,
            'Content-Type': 'application/json'
          }
        })
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(resourcepool =>
            this.$router.push('/r/resourcepool/' + resourcepool.metadata.namespace + '/' + resourcepool.metadata.name)
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
  }
}
</script>

<style>
.yaml-input {
  color: #dddddd;
  background-color: #111111;
  text-align: left;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-left: 5px;
  padding-right: 5px;
  white-space: pre;
  width: 90%;
  height: 800px;
}
</style>
