<template>
  <h1>ResourceClaim {{$route.params.name}}</h1>
  <p>{{ error }}</p>
  <p v-if="resourceHandleRef"><router-link :to="'/r/resourcehandle/' + resourceHandleRef.namespace + '/' + resourceHandleRef.name">ResourceHandle {{resourceHandleRef.name}}</router-link></p>
  <YamlBlob :obj='resourceclaim'/>
</template>

<script>
import YamlBlob from '@/components/YamlBlob.vue'

export default {
  name: 'ResourceClaim',
  components: {
    YamlBlob
  },
  computed: {
    resourceHandleRef () {
      if (this.resourceclaim && this.resourceclaim.status && this.resourceclaim.status.resourceHandle) {
        return this.resourceclaim.status.resourceHandle
      } else {
        return null
      }
    },
  },
  data () {
    return {
      error: '',
      resourceclaim: ''
    }
  },
  created () {
    window.apiSession
    .then(session => {
      return fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/resourceclaims/' + this.$route.params.name, {
        headers: {
          'Authentication': 'Bearer ' + session.token
        }
      }); 
    })
    .then(response => {
      if (response.status === 200) {
        response.json().then(data => {
          this.resourceclaim = data
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
