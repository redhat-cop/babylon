import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

function getApiSession() {
  return fetch('/session')
  .then(response => response.json())
  .then(session => {
    setTimeout(getApiSession, (session.lifetime - 60) * 1000 );
    window.apiSession = new Promise((resolve) => resolve(session))
    return(session)
  })
}

window.apiSession = new Promise((resolve) => {
  getApiSession().then(session => {
    resolve(session)
  })
})

window.consoleUrl = window.apiSession.then(session => {
  return fetch('/api/v1/namespaces/openshift-config-managed/configmaps/console-public', {
    headers: {
      'Authentication': 'Bearer ' + session.token
    }
  })
  .then(response => response.json())
  .then(data => data.data.consoleURL)
})

createApp(App).use(router).mount('#app')
