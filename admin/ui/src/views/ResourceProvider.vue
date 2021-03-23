<template>
  <h1>ResourceProvider {{$route.params.name}}</h1>
  <p>{{ error }}</p>
  <YamlBlob :obj='resourceprovider'/>
</template>

<script>
import YamlBlob from '@/components/YamlBlob.vue'

export default {
  name: 'ResourceProvider',
  components: {
    YamlBlob
  },
  data () {
    return {
      error: '',
      resourceprovider: ''
    }
  },
  created () {
    window.apiSession
    .then(session => {
      return fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/resourceproviders/' + this.$route.params.name, {
        headers: {
          'Authentication': 'Bearer ' + session.token
        }
      }); 
    })
    .then(response => {
      if (response.status === 200) {
        response.json().then(data => {
          this.resourceprovider = data
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
</script>
