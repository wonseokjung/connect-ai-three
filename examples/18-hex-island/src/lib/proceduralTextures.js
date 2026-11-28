// Textures drawn in code for connect-ai-three, in place of two image files from the original repository whose source
// is not recorded: a tileable caustic pattern (bright cell edges of a wrapped Voronoi diagram) and the cog icon.
import { CanvasTexture } from 'three/webgpu'

export function makeCausticTexture(size = 256, cells = 9, seed = 7) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const pts = Array.from({ length: cells * cells }, (_, i) => [((i % cells) + rnd()) / cells, (Math.floor(i / cells) + rnd()) / cells])
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size
      let d1 = 9, d2 = 9
      for (const [px, py] of pts) {
        // wrap around so the pattern tiles
        let dx = Math.abs(u - px); dx = Math.min(dx, 1 - dx)
        let dy = Math.abs(v - py); dy = Math.min(dy, 1 - dy)
        const d = Math.hypot(dx, dy)
        if (d < d1) { d2 = d1; d1 = d } else if (d < d2) d2 = d
      }
      const edge = Math.pow(Math.max(0, 1 - (d2 - d1) * cells * 4), 4)
      const c = Math.round(255 * Math.min(1, edge * 0.6))
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return new CanvasTexture(canvas)
}

export function makeCogTexture(size = 200) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2, teeth = 8, rOut = size * 0.44, rIn = size * 0.34, rHole = size * 0.14
  ctx.beginPath()
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2
    const r = i % 2 ? rIn : rOut
    ctx.lineTo(c + Math.cos(a0) * r, c + Math.sin(a0) * r)
    ctx.lineTo(c + Math.cos(a1) * r, c + Math.sin(a1) * r)
  }
  ctx.closePath()
  ctx.moveTo(c + rHole, c)
  ctx.arc(c, c, rHole, 0, Math.PI * 2, true)
  ctx.fillStyle = '#fff'
  ctx.fill('evenodd')
  return new CanvasTexture(canvas)
}
