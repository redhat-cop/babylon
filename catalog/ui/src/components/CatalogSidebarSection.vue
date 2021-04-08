<template>
  <li
    class="pf-c-nav__item pf-m-expandable"
    :class="(isCurrent ? ['pf-m-current'] : []).concat(isExpanded ? ['pf-m-expanded']: [])"
  >
    <button class="pf-c-nav__link">
      {{ title }}
      <NavToggle @activated="toggleExpanded()" />
    </button>
    <section
      v-if="isExpanded"
      class="pf-c-nav__subnav"
    >
      <ul class="pf-c-nav__list">
        <li
          v-for="page in pages"
          :key="page.name"
          class="pf-c-nav__item"
          :class="page.name == currentPage ? ['pf-m-current'] : []"
        >
          <router-link :to="page.path" class="pf-c-nav__link">{{ page.title }}</router-link>
        </li>
      </ul>
    </section>
  </li>
</template>

<script>
import NavToggle from '@/components/NavToggle.vue'

export default {
  components: {
    NavToggle
  },
  props: ['isCurrent', 'currentPage', 'name', 'title', 'pages'],
  data () {
    return { isExpanded: this.isCurrent }
  },
  methods: {
    toggleExpanded () {
      this.isExpanded = ! this.isExpanded
    }
  },
}
</script>
