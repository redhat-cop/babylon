<template>
  <ul class="vertical-tabs-pf restrict-tabs active-tab" shown="true">
    <li
      class="vertical-tabs-pf-tab text-capitalize"
      :class="selectedCategory ? [] : ['active']"
      @click="$emit('categorySelected', null)"
    >
      <a href="#">all categories</a>
    </li>
    <li v-for="category in categories" :key="category"
      class="vertical-tabs-pf-tab text-capitalize"
      :class="selectedCategory == category ? ['active'] : []"
      @click="$emit('categorySelected', category)"
    >
      <a href="#">{{ category }}</a>
    </li>
  </ul>
</template>

<script>
export default {
  name: 'CategorySelector',
  emits: ['categorySelected'],
  props: ['selectedCategory', 'categories'],
}
</script>

<style>
.text-capitalize {
    text-transform: capitalize;
}
</style>
