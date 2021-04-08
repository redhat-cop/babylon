<template>
  <div class="co-catalog-page__grid">
    <slot></slot>
  </div>
</template>

<script>
export default {
  name: 'CatalogPageGrid',
}
</script>

<style>
.co-catalog-page__grid {
  background-color: #f5f5f5;
  display: grid;
  grid-template-columns: repeat(auto-fill, 260px);
  gap: 24px;
  grid-auto-flow: dense;
  margin: 0;
  padding: 24px;
}
</style>
