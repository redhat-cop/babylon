<template>
  <div class="pf-c-page__header-brand">
    <div class="pf-c-page__header-brand-toggle">
      <button
        class="pf-c-button pf-m-plain"
        type="button"
        @click="$emit('toggleSidebarOpen')"
      >
        <BarsIcon/>
      </button>
    </div>
    <a class="pf-c-page__header-brand-link" href="/ui/">
      <img class="pf-c-brand" :src="publicPath + 'assets/logo.png'">
    </a>
    <a href="/ui/" class="pf-c-button pf-m-plain" type="button">
    <b>RHPDS</b> - Red Hat Product Demo System
    </a>
  </div>
  <div class="pf-c-page__header-tools">
    <div class="pf-c-page__header-tools-group hidden-xs">
      <div class="pf-c-page__header-tools-item">
        <nav class="pf-c-app-launcher pf-m-align-right">
          <button class="pf-c-button pf-m-plain" type="button">
            <NotificationBadge />
          </button>
        </nav>
      </div>
      <div class="pf-c-page__header-tools-item">
        <nav class="pf-c-app-launcher pf-m-align-right">
          <AppLauncherToggle icon="question-circle" @activated="toggleShowHelpMenu()" />
          <div v-if="showHelpMenu" class="pf-c-app-launcher__menu pf-m-align-right" role="menu">
            <section class="pf-c-app-launcher__group">
              <ul role="none">
                <li role="menuitem">
                  <span class="pf-c-app-launcher__menu-item">... TBD ...</span>
                </li>
              </ul>
            </section>
          </div>
        </nav>
      </div>
    </div>
    <div class="pf-c-page__header-tools-group">
      <div class="pf-c-page__header-tools-item hidden-xs">
        <nav
          class="pf-c-app-launcher pf-m-align-right co-app-launcher co-user-menu"
          :class="showLogout ? ['pf-m-expanded'] : []"
        >
          <AppLauncherToggle icon="caret-down" :labelText="userName" @activated="toggleShowLogout()" />
          <div v-if="showLogout" class="pf-c-app-launcher__menu pf-m-align-right" role="menu">
            <section class="pf-c-app-launcher__group">
              <ul role="none">
                <li role="menuitem">
                  <a href="/oauth/sign_in" type="button" class="pf-c-app-launcher__menu-item">Log out</a>
                </li>
              </ul>
            </section>
          </div>
        </nav>
      </div>
    </div>
  </div>
</template>

<script>
import BarsIcon from '@/components/icons/BarsIcon.vue'
import AppLauncherToggle from '@/components/AppLauncherToggle.vue'
import NotificationBadge from '@/components/NotificationBadge.vue'

export default {
  components: {
    AppLauncherToggle,
    BarsIcon,
    NotificationBadge,
  },
  data () {
    return {
      publicPath: process.env.BASE_URL,
      userName: '-',
      showHelpMenu: false,
      showLogout: false,
      sidebarOpen: true,
    }
  },
  created () {
    window.apiSession.then(session => {
      this.userName = session.user;
    })
  },
  emits: ['toggleSidebarOpen'],
  methods: {
    toggleShowHelpMenu () {
      this.showHelpMenu = !this.showHelpMenu;
    },
    toggleShowLogout () {
      this.showLogout = !this.showLogout;
    },
  }
}
</script>
