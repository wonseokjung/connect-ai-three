// heritage/materials.js from Hailey's threejs-architecture-effects (MIT, https://github.com/lhlGitHub/threejs-architecture-effects):
// assets/starter/src/heritage/materials.ts with the TypeScript types stripped by esbuild for connect-ai-three (the comments
// are in the original). Imports point at three/addons/ instead of three/examples/jsm/.
import * as THREE from "three";
function createHeritageMaterials(renderer) {
  const textures = [];
  const palette = {
    brick: "#914735",
    wood: "#513825",
    jade: "#355d50",
    stone: "#9b9688",
    plaster: "#dad6c9",
    tile: "#3e584f",
    bronze: "#887040",
    recess: "#282921",
    cloth: "#555c53",
    paper: "#d9ab70",
    moss: "#45573a",
    glass: "#b6c8c3"
  };
  const output = {};
  for (const [name, base] of Object.entries(palette)) {
    if (name === "glass") {
      output[name] = new THREE.MeshPhysicalMaterial({ color: base, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.09, depthWrite: false, clearcoat: 0.65, clearcoatRoughness: 0.18, vertexColors: true });
      continue;
    }
    const canvas = document.createElement("canvas");
    const size = name === "plaster" ? 1024 : 512;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    let seed = 83 + name.length * 101;
    const rand = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 180; i++) {
      const x = rand() * size, y = rand() * size, r = size * (0.02 + rand() * 0.13);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, name === "tile" ? i % 3 ? "rgba(25,30,27,.035)" : "rgba(210,217,201,.025)" : i % 3 ? "rgba(45,34,19,.038)" : "rgba(252,244,217,.045)");
      gradient.addColorStop(1, "rgba(100,80,50,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (name === "wood") {
      for (let i = 0; i < 290; i++) {
        const x = rand() * size;
        ctx.strokeStyle = i % 3 ? "rgba(30,19,10,.16)" : "rgba(223,184,127,.13)";
        ctx.lineWidth = 0.4 + rand() * 1.8;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let y = 0; y <= size; y += 8) ctx.lineTo(x + Math.sin(y * 0.035 + x) * 2 + Math.sin(y * 8e-3) * 5, y);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const x = rand() * size, y = rand() * size;
        for (let k = 1; k < 7; k++) {
          ctx.strokeStyle = "rgba(35,22,12,.16)";
          ctx.beginPath();
          ctx.ellipse(x, y, k * 1.8, k * 7, 0.1, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    if (name === "plaster") {
      const noise = (x, y) => Math.sin(x * 0.024 + y * 0.019) * 0.5 + Math.sin(x * 0.065 - y * 0.035) * 0.25 + Math.sin(x * 0.111 + y * 0.073) * 0.16;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, size);
      for (let x = 0; x <= size; x += 4) {
        const edge = size * (0.87 + 0.034 * Math.sin(x * 8e-3) + 0.027 * Math.sin(x * 0.021) + 7e-3 * Math.sin(x * 0.193)) + noise(x, 100) * 28;
        ctx.lineTo(x, edge);
      }
      ctx.lineTo(size, size);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "#a49a85";
      ctx.fillRect(0, 0, size, size);
      for (let row = 0; row < 29; row++) for (let col = -1; col < 16; col++) {
        const x = col * 74 + row % 2 * 37, y = row * 39;
        const v = Math.floor(126 + rand() * 23);
        ctx.fillStyle = `rgb(${v + 29},${v + 8},${v - 14})`;
        ctx.fillRect(x + 2, y + 2, 70, 35);
        ctx.fillStyle = "rgba(240,226,202,.28)";
        ctx.fillRect(x + 2, y + 2, 70, 1.5);
      }
      ctx.restore();
      const crack = (x, y, length, angle, width, depth) => {
        ctx.strokeStyle = "rgba(83,70,49,.20)";
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 9; j++) {
          angle += (rand() - 0.5) * 0.9;
          x += Math.cos(angle) * length / 9;
          y += Math.sin(angle) * length / 9;
          ctx.lineTo(x, y);
          if (j === 4 && depth > 0) crack(x, y, length * 0.5, angle + 0.9, width * 0.55, depth - 1);
        }
        ctx.stroke();
      };
      for (let i = 0; i < 22; i++) crack(rand() * size, rand() * size, size * (0.06 + rand() * 0.16), 0.6 + rand() * 2, 0.65 + rand() * 0.8, 2);
      for (let i = 0; i < 45; i++) {
        const x = rand() * size, w = 2 + rand() * 18, h = 40 + rand() * 240;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(80,82,55,.12)");
        g.addColorStop(1, "rgba(80,82,55,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, w, h);
      }
    }
    for (let i = 0; i < (name === "plaster" ? 45e3 : 17e3); i++) {
      ctx.globalAlpha = name === "tile" ? 0.18 : 1;
      ctx.fillStyle = rand() > 0.45 ? `rgba(255,242,214,${0.04 + rand() * 0.13})` : `rgba(31,26,18,${0.025 + rand() * 0.1})`;
      const s = 0.4 + rand() * 1.6;
      ctx.fillRect(rand() * size, rand() * size, s, s);
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.push(texture);
    const detail = document.createElement("canvas");
    detail.width = detail.height = 256;
    const dc = detail.getContext("2d"), pixels = dc.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const grain = name === "wood" ? Math.sin(x * 0.83 + Math.sin(y * 0.033) * 2) * 20 : 0;
      const v = 128 + (rand() - 0.5) * (name === "stone" ? 65 : 32) + grain;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
    dc.putImageData(pixels, 0, 0);
    const bump = new THREE.CanvasTexture(detail);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.anisotropy = texture.anisotropy;
    textures.push(bump);
    const roughCanvas = document.createElement("canvas");
    roughCanvas.width = roughCanvas.height = 256;
    const rc = roughCanvas.getContext("2d");
    rc.fillStyle = name === "tile" ? "#aaaaaa" : name === "wood" ? "#d4d4d4" : "#ededed";
    rc.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      rc.fillStyle = `rgba(60,60,60,${0.02 + rand() * 0.045})`;
      rc.fillRect(rand() * 256, rand() * 256, 8 + rand() * 35, 8 + rand() * 35);
    }
    const roughness = new THREE.CanvasTexture(roughCanvas);
    roughness.wrapS = roughness.wrapT = THREE.RepeatWrapping;
    textures.push(roughness);
    output[name] = new THREE.MeshStandardMaterial({ map: texture, bumpMap: bump, roughnessMap: roughness, bumpScale: name === "plaster" ? 0.013 : name === "tile" ? 6e-3 : 0.024, roughness: name === "bronze" ? 0.62 : name === "tile" ? 0.82 : 0.96, metalness: name === "bronze" ? 0.65 : 0, vertexColors: true });
    if (name === "paper") {
      output[name].emissive.set("#9d5020");
      output[name].emissiveIntensity = 0.28;
    }
  }
  return { materials: output, dispose() {
    textures.forEach((t) => t.dispose());
    Object.values(output).forEach((m) => m.dispose());
  } };
}
export {
  createHeritageMaterials
};
