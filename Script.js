const canvas = document.getElementById("globe");
const ctx = canvas.getContext("2d");

const toggleButton = document.getElementById("toggle");
const stepButton = document.getElementById("step");
const randomizeButton = document.getElementById("randomize");
const clearButton = document.getElementById("clear");
const speedInput = document.getElementById("speed");
const resolutionInput = document.getElementById("resolution");
const zoomInput = document.getElementById("zoom");
const speedValue = document.getElementById("speedValue");
const resolutionValue = document.getElementById("resolutionValue");
const zoomValue = document.getElementById("zoomValue");
const hudZoom = document.getElementById("hudZoom");
const generationCount = document.getElementById("generationCount");
const aliveCountValue = document.getElementById("aliveCount");
const simulationStatus = document.getElementById("simulationStatus");
const infoButton = document.getElementById("info");
const infoPanel = document.getElementById("infoPanel");
const infoClose = document.getElementById("infoClose");

const perspective = 3;
const baseRadius = 0.82;
const lightDirection = normalize([0.35, 0.65, 0.42]);

let cells = [];
let state = new Uint8Array(0);
let buffer = new Uint8Array(0);
let neighbors = [];
let projected = [];
let ages = new Uint16Array(0);
let ageBuffer = new Uint16Array(0);
let decays = new Float32Array(0);
let decayBuffer = new Float32Array(0);
let faceSize = parseInt(resolutionInput.value, 10);
let running = false;
let needsRender = true;
let lastTick = 0;
let lastFrame = 0;
let generationDelay = parseInt(speedInput.value, 10);
let autoRotationSpeed = 0.00012;
let zoomLevel = parseInt(zoomInput.value, 10) / 100;
let generation = 0;
let aliveCount = 0;

let rotationX = 0.35;
let rotationY = 0.2;
let pointerActive = false;
let dragging = false;
let lastPointer = { x: 0, y: 0 };
let storedScrollTimeout = null;

function normalize(vec) {
  const length = Math.hypot(vec[0], vec[1], vec[2]);
  return [vec[0] / length, vec[1] / length, vec[2] / length];
}

function cubeToSphere(face, u, v) {
  let x;
  let y;
  let z;

  switch (face) {
    case 0: // +X
      x = 1;
      y = v;
      z = -u;
      break;
    case 1: // -X
      x = -1;
      y = v;
      z = u;
      break;
    case 2: // +Y
      x = u;
      y = 1;
      z = v;
      break;
    case 3: // -Y
      x = u;
      y = -1;
      z = -v;
      break;
    case 4: // +Z
      x = u;
      y = v;
      z = 1;
      break;
    default: // -Z
      x = -u;
      y = v;
      z = -1;
      break;
  }

  return normalize([x, y, z]);
}

function rotateVector([x, y, z], rx, ry) {
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y1 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;

  return [x1, y1, z2];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resizeCanvas() {
  if (!canvas) return;

  let rect = canvas.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) {
    const parent = canvas.parentElement;
    if (parent) {
      const parentRect = parent.getBoundingClientRect();
      if (parentRect.width > 0 && parentRect.height > 0) {
        rect = parentRect;
      } else {
        requestAnimationFrame(resizeCanvas);
        return;
      }
    } else {
      return;
    }
  }

  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
  const targetHeight = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    needsRender = true;
  }
}

function buildSphere() {
  faceSize = parseInt(resolutionInput.value, 10);
  resolutionValue.textContent = faceSize.toString();

  const cellsList = [];
  const offsets = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];

  for (let face = 0; face < 6; face += 1) {
    for (let row = 0; row < faceSize; row += 1) {
      for (let col = 0; col < faceSize; col += 1) {
        const uCenter = ((col + 0.5) / faceSize) * 2 - 1;
        const vCenter = ((row + 0.5) / faceSize) * 2 - 1;
        const center = cubeToSphere(face, uCenter, vCenter);

        const corners = offsets.map(([dx, dy]) => {
          const u = ((col + 0.5 + dx) / faceSize) * 2 - 1;
          const v = ((row + 0.5 + dy) / faceSize) * 2 - 1;
          return cubeToSphere(face, u, v);
        });

        cellsList.push({
          face,
          row,
          col,
          center,
          corners,
        });
      }
    }
  }

  cells = cellsList;
  state = new Uint8Array(cells.length);
  buffer = new Uint8Array(cells.length);
  ages = new Uint16Array(cells.length);
  ageBuffer = new Uint16Array(cells.length);
  decays = new Float32Array(cells.length);
  decayBuffer = new Float32Array(cells.length);
  neighbors = new Array(cells.length);

  computeNeighbors();
  running = false;
  generation = 0;
  aliveCount = 0;
  toggleButton.textContent = "Démarrer";
  updateHUD();
  needsRender = true;
}

function computeNeighbors() {
  const centers = cells.map((cell) => cell.center);

  for (let i = 0; i < cells.length; i += 1) {
    const base = centers[i];
    const list = [];

    for (let j = 0; j < centers.length; j += 1) {
      if (i === j) continue;

      const target = centers[j];
      const dot = base[0] * target[0] + base[1] * target[1] + base[2] * target[2];
      const distance = 1 - dot; // proportionnel à l'angle

      insertNeighbor(list, { index: j, distance });
    }

    neighbors[i] = list.map((item) => item.index);
  }
}

function insertNeighbor(list, candidate) {
  let inserted = false;

  for (let i = 0; i < list.length; i += 1) {
    if (candidate.distance < list[i].distance) {
      list.splice(i, 0, candidate);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    list.push(candidate);
  }

  if (list.length > 8) {
    list.length = 8;
  }
}

function randomizeState() {
  generation = 0;
  aliveCount = 0;
  for (let i = 0; i < state.length; i += 1) {
    if (Math.random() < 0.32) {
      state[i] = 1;
      ages[i] = Math.floor(Math.random() * 4) + 1;
      decays[i] = 0;
      aliveCount += 1;
    } else {
      state[i] = 0;
      ages[i] = 0;
      decays[i] = Math.random() * 0.2;
    }
  }
  needsRender = true;
  updateHUD();
}

function clearState() {
  generation = 0;
  aliveCount = 0;
  state.fill(0);
  buffer.fill(0);
  ages.fill(0);
  ageBuffer.fill(0);
  decays.fill(0);
  decayBuffer.fill(0);
  needsRender = true;
  updateHUD();
}

function stepSimulation(advanceGeneration = true) {
  if (!state.length) return;

  let aliveNext = 0;

  for (let i = 0; i < state.length; i += 1) {
    const alive = state[i];
    const neighborList = neighbors[i];
    let count = 0;

    for (let k = 0; k < neighborList.length; k += 1) {
      count += state[neighborList[k]];
    }

    const willLive = alive ? (count === 2 || count === 3 ? 1 : 0) : count === 3 ? 1 : 0;
    buffer[i] = willLive;
    if (willLive) {
      aliveNext += 1;
    }
  }

  for (let i = 0; i < state.length; i += 1) {
    if (buffer[i]) {
      ageBuffer[i] = state[i] ? ages[i] + 1 : 1;
      decayBuffer[i] = 0;
    } else {
      ageBuffer[i] = 0;
      if (state[i]) {
        decayBuffer[i] = 1;
      } else {
        decayBuffer[i] = decays[i] * 0.6;
      }
    }
  }

  if (advanceGeneration) {
    generation += 1;
  }

  const temp = state;
  state = buffer;
  buffer = temp;

  const tempAge = ages;
  ages = ageBuffer;
  ageBuffer = tempAge;

  const tempDecay = decays;
  decays = decayBuffer;
  decayBuffer = tempDecay;

  aliveCount = aliveNext;
  needsRender = true;
  updateHUD();
}

function render() {
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const radius = Math.min(width, height) * baseRadius * zoomLevel;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createRadialGradient(
    width * 0.3,
    height * 0.25,
    width * 0.1,
    width * 0.5,
    height * 0.55,
    width * 0.8,
  );
  background.addColorStop(0, "rgba(46, 62, 120, 0.65)");
  background.addColorStop(1, "rgba(2, 5, 12, 0.95)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const data = [];

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const rotatedCenter = rotateVector(cell.center, rotationX, rotationY);
    const isFront = rotatedCenter[2] >= 0;
    const perspectiveScale = perspective / (perspective - rotatedCenter[2]);
    const centerX = width / 2 + rotatedCenter[0] * perspectiveScale * radius;
    const centerY = height / 2 + rotatedCenter[1] * perspectiveScale * radius;

    const corners = [];
    let depthSum = 0;

    const scaleFactor = cellScale(state[i] === 1, ages[i], decays[i]);

    for (let c = 0; c < cell.corners.length; c += 1) {
      const corner = rotateVector(cell.corners[c], rotationX, rotationY);
      const scale = perspective / (perspective - corner[2]);
      let x = width / 2 + corner[0] * scale * radius;
      let y = height / 2 + corner[1] * scale * radius;

      x = centerX + (x - centerX) * scaleFactor;
      y = centerY + (y - centerY) * scaleFactor;

      corners.push([x, y]);
      depthSum += corner[2];
    }

    if (corners.length < 3) continue;

    const path = new Path2D();
    path.moveTo(corners[0][0], corners[0][1]);
    for (let p = 1; p < corners.length; p += 1) {
      path.lineTo(corners[p][0], corners[p][1]);
    }
    path.closePath();

    const brightness = Math.max(
      0.18,
      0.25 + 0.75 * Math.max(0, rotatedCenter[0] * lightDirection[0] + rotatedCenter[1] * lightDirection[1] + rotatedCenter[2] * lightDirection[2]),
    );
    const alive = state[i] === 1;
    const color = alive
      ? aliveColor(brightness, ages[i], !isFront)
      : decays[i] > 0.01
      ? decayColor(brightness, decays[i], !isFront)
      : deadColor(brightness, rotatedCenter[2], !isFront);

    const gridIntensity = state[i]
      ? 0.5
      : decays[i] > 0.01
      ? 0.35
      : 0.24;
    const gridAlpha = isFront ? gridIntensity : gridIntensity * 0.45;
    const gridColor = `rgba(${isFront ? 86 : 68}, ${isFront ? 168 : 146}, ${isFront ? 182 : 170}, ${gridAlpha})`;
    const gridWidth = clamp(radius * (isFront ? 0.0024 : 0.002), 0.45, isFront ? 1.45 : 1.2);

    data.push({
      index: i,
      depth: depthSum / corners.length,
      path,
      color,
      alive,
      interactive: isFront,
      gridColor,
      gridWidth,
    });
  }

  data.sort((a, b) => a.depth - b.depth);
  projected = data.filter((item) => item.interactive);

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let i = 0; i < data.length; i += 1) {
    const item = data[i];
    ctx.fillStyle = item.color;
    ctx.fill(item.path);

    ctx.strokeStyle = item.gridColor;
    ctx.lineWidth = item.gridWidth;
    ctx.stroke(item.path);
  }

  const rimGradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.8, width / 2, height / 2, radius * 1.08);
  rimGradient.addColorStop(0, "rgba(8, 16, 32, 0)");
  rimGradient.addColorStop(1, "rgba(0, 0, 0, 0.6)");
  ctx.fillStyle = rimGradient;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, radius * 1.08, 0, Math.PI * 2);
  ctx.fill();
}

function cellScale(alive, age, decay) {
  if (alive) {
    if (age <= 1) return 0.62;
    if (age <= 3) return 0.82;
    if (age <= 6) return 0.98;
    return 1.08;
  }

  if (decay > 0.01) {
    return clamp(0.85 + decay * 0.3, 0.85, 1.12);
  }

  return 1;
}

function aliveColor(brightness, age, isBack) {
  const stage = Math.min(age, 10);
  const hue = clamp(200 - stage * 9, 110, 200);
  const saturation = clamp(58 + stage * 3, 58, 88);
  const lightness = clamp(30 + brightness * 30 + stage * 0.8, 25, 70);
  const alpha = isBack ? 0.38 : 0.9;
  return hslToRgbaString(hue, saturation, lightness, alpha);
}

function decayColor(brightness, decay, isBack) {
  const hue = clamp(210 - decay * 70, 140, 210);
  const saturation = clamp(35 + decay * 45, 35, 85);
  const lightness = clamp(18 + brightness * 22 + decay * 18, 18, 60);
  const alpha = isBack ? 0.28 : 0.65;
  return hslToRgbaString(hue, saturation, lightness, alpha);
}

function deadColor(brightness, depth, isBack) {
  const horizon = Math.max(0, Math.min(1, 1 - depth));
  const hue = 215;
  const saturation = 32 + horizon * 10;
  const lightness = clamp(12 + brightness * 20 + horizon * 5, 10, 45);
  const alpha = isBack ? 0.2 : 0.35;
  return hslToRgbaString(hue, saturation, lightness, alpha);
}

function hslToRgbaString(h, s, l, a) {
  const [r, g, b] = hslToRgb(h, s, l);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s / 100, 0, 1);
  l = clamp(l / 100, 0, 1);

  if (s === 0) {
    const val = l * 255;
    return [val, val, val];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;

  const r = hueToRgb(p, q, hk + 1 / 3);
  const g = hueToRgb(p, q, hk);
  const b = hueToRgb(p, q, hk - 1 / 3);

  return [r * 255, g * 255, b * 255];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function toggleCellAt(clientX, clientY) {
  if (!projected.length) return;

  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (let i = projected.length - 1; i >= 0; i -= 1) {
    const region = projected[i];
    if (ctx.isPointInPath(region.path, x, y)) {
      state[region.index] = state[region.index] ? 0 : 1;
      if (state[region.index]) {
        ages[region.index] = 1;
        decays[region.index] = 0;
        aliveCount += 1;
      } else {
        ages[region.index] = 0;
        decays[region.index] = 1;
        aliveCount = Math.max(0, aliveCount - 1);
      }
      generation = Math.max(0, generation);
      needsRender = true;
      updateHUD();
      break;
    }
  }
}

function animationFrame(timestamp) {
  if (!lastFrame) {
    lastFrame = timestamp;
  }

  const delta = timestamp - lastFrame;
  lastFrame = timestamp;

  if (!dragging) {
    rotationY += delta * autoRotationSpeed;
  }

  if (running && timestamp - lastTick >= generationDelay) {
    stepSimulation(true);
    lastTick = timestamp;
  }

  if (needsRender || running) {
    render();
    needsRender = false;
  }

  requestAnimationFrame(animationFrame);
}

function updateSpeed() {
  generationDelay = parseInt(speedInput.value, 10);
  speedValue.textContent = `${generationDelay}\u00a0ms`;
}

function updateZoom(fromSlider = true) {
  if (fromSlider) {
    zoomLevel = parseInt(zoomInput.value, 10) / 100;
  } else {
    zoomInput.value = Math.round(zoomLevel * 100);
  }

  zoomLevel = clamp(zoomLevel, 0.7, 1.25);
  zoomValue.textContent = `${Math.round(zoomLevel * 100)}\u00a0%`;
  hudZoom.textContent = `${zoomLevel.toFixed(2)}x`;
  needsRender = true;
}

function handlePointerDown(event) {
  pointerActive = true;
  dragging = false;
  lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!pointerActive) return;

  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;

  if (!dragging && Math.hypot(dx, dy) > 3) {
    dragging = true;
  }

  if (dragging) {
    rotationY += dx * 0.006;
    rotationX += dy * 0.006;
    rotationX = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, rotationX));
    needsRender = true;
  }

  lastPointer = { x: event.clientX, y: event.clientY };
}

function handlePointerUp(event) {
  if (!pointerActive) return;
  pointerActive = false;
  if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  if (!dragging) {
    toggleCellAt(event.clientX, event.clientY);
  }
  dragging = false;
}

function handleWheel(event) {
  event.preventDefault();
  const delta = event.deltaY;
  zoomLevel = clamp(zoomLevel - delta * 0.0007, 0.7, 1.25);
  updateZoom(false);
  updateHUD();

  if (storedScrollTimeout) {
    clearTimeout(storedScrollTimeout);
  }
  storedScrollTimeout = setTimeout(() => {
    storedScrollTimeout = null;
  }, 180);
}

function setupControls() {
  toggleButton.addEventListener("click", () => {
    running = !running;
    toggleButton.textContent = running ? "Pause" : "Démarrer";
    if (running) {
      lastTick = performance.now();
    }
    updateHUD();
  });

  stepButton.addEventListener("click", () => {
    if (!running) {
      stepSimulation(true);
    }
  });

  randomizeButton.addEventListener("click", randomizeState);
  clearButton.addEventListener("click", clearState);
  speedInput.addEventListener("input", updateSpeed);
  resolutionInput.addEventListener("input", () => {
    buildSphere();
    randomizeState();
  });
  zoomInput.addEventListener("input", () => {
    updateZoom(true);
    updateHUD();
  });

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointerleave", () => {
    pointerActive = false;
    dragging = false;
  });
  canvas.addEventListener("wheel", handleWheel, { passive: false });

  infoButton.addEventListener("click", openInfoPanel);
  infoClose.addEventListener("click", closeInfoPanel);
  infoPanel.addEventListener("click", (event) => {
    if (event.target === infoPanel || event.target.hasAttribute("data-modal-close")) {
      closeInfoPanel();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !infoPanel.hidden) {
      closeInfoPanel();
    }
  });
}

function openInfoPanel() {
  infoPanel.hidden = false;
  document.body.classList.add("modal-open");
  infoButton.setAttribute("aria-expanded", "true");
  infoPanel.querySelector(".modal__dialog").focus();
}

function closeInfoPanel() {
  infoPanel.hidden = true;
  document.body.classList.remove("modal-open");
  infoButton.setAttribute("aria-expanded", "false");
  infoButton.focus();
}

function updateHUD() {
  generationCount.textContent = generation.toString();
  aliveCountValue.textContent = aliveCount.toString();
  hudZoom.textContent = `${zoomLevel.toFixed(2)}x`;
  simulationStatus.textContent = running ? "Lecture automatique" : "En pause";
}

window.addEventListener("resize", () => {
  resizeCanvas();
});

if ("ResizeObserver" in window) {
  const observer = new ResizeObserver(() => {
    resizeCanvas();
  });
  if (canvas.parentElement) {
    observer.observe(canvas.parentElement);
  } else {
    observer.observe(canvas);
  }
}

setupControls();
resizeCanvas();
buildSphere();
updateSpeed();
updateZoom(true);
randomizeState();
requestAnimationFrame(animationFrame);
