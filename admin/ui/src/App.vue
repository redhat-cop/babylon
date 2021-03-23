<template>
  <div id="sidebar">
    <div id="logo">
      <h1><router-link to="/">Babylon</router-link></h1>
    </div>
    <div id="nav">
      <router-link to="/r/anarchygovernors">AnarchyGovernors</router-link>
      <router-link to="/r/anarchysubjects">AnarchySubjects</router-link>
      <router-link to="/r/anarchyactions">AnarchyActions</router-link>
      <router-link to="/r/anarchyruns">AnarchyRuns</router-link>
      <router-link to="/r/resourcepools">ResourcePools</router-link>
      <router-link to="/r/resourceclaims">ResourceClaims</router-link>
      <router-link to="/r/resourcehandles">ResourceHandles</router-link>
      <router-link to="/r/resourceproviders">ResourceProviders</router-link>
    </div>
  </div>
  <div id="page">
    <router-view/>
  </div>
</template>

<style>
body {
  margin: 0;
}

#sidebar {
  position: absolute;
  left: 0;
  top: 0;
  width: 200px;
  border-right: 1px solid black;
  padding-left: 5px;
  padding-right: 5px;
  min-height: 100%;
}

#page {
  margin-left: 220px;
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

#logo {
  height: 80px;
}

#logo h1 {
  font-size: 40px;
  padding-top: 5px;
  padding-left: 20px;
  margin: 0;
}

#logo h1 a {
  text-decoration: none;
  color: black;
}

#logo img {
  width: 100%;
  padding-left: auto;
  padding-right: auto;
}

#nav {
  padding-left: 10px;
}

#nav a {
  display: block;
  font-weight: bold;
  font-size: 20px;
  color: #2c3e50;
  text-decoration: none;
}

#nav a.router-link-exact-active {
  color: #42b983;
}

td {
  vertical-align: top;
  text-align: left;
}

th {
  vertical-align: top;
  text-align: left;
}
</style>
