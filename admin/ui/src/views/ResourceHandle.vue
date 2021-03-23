<template>
  <h1>ResourceHandle {{$route.params.name}}</h1>
  <p>{{ error }}</p>
  <p v-if="resourcePoolRef"><router-link :to="'/r/resourcepool/' + resourcePoolRef.namespace + '/' + resourcePoolRef.name">ResourcePool {{resourcePoolRef.name}}</router-link></p>
  <p v-if="resourceClaimRef"><router-link :to="'/r/resourceclaim/' + resourceClaimRef.namespace + '/' + resourceClaimRef.name">ResourceClaim {{resourceClaimRef.namespace}}/{{resourceClaimRef.name}}</router-link></p>
  <p v-if="resourceClaimRef"><router-link :to="'/r/resourcepool/createfrom/handle/' + $route.params.namespace + '/' + $route.params.name">Create Pool from Handle</router-link></p>
  <YamlBlob :obj='resourcehandle'/>
</template>

<script>
import YamlBlob from '@/components/YamlBlob.vue'

export default {
  name: 'ResourceHandle',
  components: {
    YamlBlob
  },
  computed: {
    resourceClaimRef () {
      if (this.resourcehandle && this.resourcehandle.spec.resourceClaim) {
        return this.resourcehandle.spec.resourceClaim
      } else {
        return null
      }
    },
    resourcePoolRef () {
      if (this.resourcehandle && this.resourcehandle.spec.resourcePool) {
        return this.resourcehandle.spec.resourcePool
      } else {
        return null
      }
    }
  },
  data () {
    return {
      error: '',
      resourcehandle: ''
    }
  },
  created () {
    this.refresh()
  },
  methods: {
    refresh () {
      window.apiSession
      .then(session =>
        fetch('/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/resourcehandles/' + this.$route.params.name, {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        }) 
        .then(response => {
          if (response.status === 200) {
            response.json().then(data => {
              this.resourcehandle = data
            })
          }
        })
      )
      .catch(error => {
        this.error = error
      })
    }
  }
}
</script>
