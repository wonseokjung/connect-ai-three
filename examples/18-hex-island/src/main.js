import { App } from './App.js'

const loadingEl = document.getElementById('loading')
const canvas = document.getElementById('canvas')

let app = null

async function init() {

  app = new App(canvas)
  await app.init()

  // Hide loading overlay
  loadingEl.style.display = 'none'

  // Fade in scene
  app.fadeIn(1000)

  // Start intro build animation
  app.city.startIntroAnimation(app.camera, app.controls, 4)

  // connect-ai-three: the island starts building itself (the middle plot and the ring around it, like the Build All
  // button does for 19 plots); the cogs left around it grow more island where you click
  setTimeout(() => app.city.autoBuild([[0, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]]), 600)

  // connect-ai-three: filmed by the kit, start from a lower, more cinematic angle than the top-down default
  if (window.__FILM__) { app.perspCamera.position.set(0, 52, 72); app.controls.target.set(0, 1, 0); app.controls.update() }

  // connect-ai-three: tell the smoke test and the preview capture that the island is drawing
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.EXAMPLE = { ready: true, renderer: app.renderer, scene: app.scene, camera: app.camera, controls: app.controls }
  }))
}

init()
