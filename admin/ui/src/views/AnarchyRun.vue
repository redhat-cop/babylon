<template>
  <h1>AnarchyRun {{this.$route.params.name}}</h1>
  <p>{{error}}</p>
  <template v-if="anarchyRun">
    <p><router-link :to="'/r/anarchysubject/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/subject']">AnarchySubject {{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/subject']}}</router-link></p>
    <p><router-link :to="'/r/anarchygovernor/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/governor']">AnarchyGovernor {{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/governor']}}</router-link></p>
    <p v-if="anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']"><router-link :to="'/r/anarchyaction/' + anarchyRun.metadata.namespace + '/' + anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']">AnarchyAction {{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/action']}}</router-link></p>
    <template v-if="anarchyRun.spec.result">
      <p><b>Result:</b> {{anarchyRun.spec.result.status}}</p>
      <h2>Log</h2>
      <AnsibleRunLog :ansibleRun='anarchyRun.spec.result.ansibleRun'/>
    </template>
  </template>
</template>

<script>
import AnsibleRunLog from '@/components/AnsibleRunLog.vue'

export default {
  name: 'AnarchyRun',
  components: {
    AnsibleRunLog
  },
  data () {
    return {
      error: '',
      anarchyRun: null
    }
  },
  created () {
    this.refresh();
  },
  methods: {
    refresh () {
      window.apiSession
      .then(session =>
        fetch('/apis/anarchy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/anarchyruns/' + this.$route.params.name, {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        })
      )
      .then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.anarchyRun = data
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
