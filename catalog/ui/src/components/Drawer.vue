<template>
  <div class="pf-c-drawer pf-m-inline">
    <div class="pf-c-drawer__main">
      <div class="pf-c-drawer__content">
        <div class="pf-c-drawer__body co-quick-start-drawer__body">
          <slot></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.co-quick-start-drawer__body {
    display: flex;
    flex-direction: column;
    z-index: 0;
    position: relative;
}
</style>
