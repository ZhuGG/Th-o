const canvas = document.getElementById("globe");
const ctx = canvas.getContext("2d");

const toggleButton = document.getElementById("toggle");
const stepButton = document.getElementById("step");
const randomizeButton = document.getElementById("randomize");
const clearButton = document.getElementById("clear");
const speedInput = document.getElementById("speed");
const resolutionInput = document.getElementById("resolution");
const speedValue = document.getElementById("speedValue");
const resolutionValue = document.getElementById("resolutionValue");

const perspective = 3;
const baseRadius = 0.88;
const lightDirection = normalize([0.35, 0.65, 0.42]);

let cells = [];
let state = new Uint8Array(0);
let buffer = new Uint8Array(0);
let neighbors = [];
let projected = [];
let faceSize = parseInt(resolutionInput.value, 10);
let running = false;
let needsRender = true;
let lastTick = 0;
let lastFrame = 0;
let generationDelay = parseInt(speedInput.value, 10);
let autoRotationSpeed = 0.00012;

let rotationX = 0.35;
let rotationY = 0.2;
let pointerActive = false;
let dragging = false;
let lastPointer = { x: 0, y: 0 };

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

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  needsRender = true;
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
  neighbors = new Array(cells.length);

  computeNeighbors();
  running = false;
  toggleButton.textContent = "Démarrer";
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
  for (let i = 0; i < state.length; i += 1) {
    state[i] = Math.random() < 0.32 ? 1 : 0;
  }
  needsRender = true;
}

function clearState() {
  state.fill(0);
  needsRender = true;
}

function stepSimulation() {
  for (let i = 0; i < state.length; i += 1) {
    const alive = state[i];
    const neighborList = neighbors[i];
    let count = 0;

    for (let k = 0; k < neighborList.length; k += 1) {
      count += state[neighborList[k]];
    }

    if (alive) {
      buffer[i] = count === 2 || count === 3 ? 1 : 0;
    } else {
      buffer[i] = count === 3 ? 1 : 0;
    }
  }

  const temp = state;
  state = buffer;
  buffer = temp;
  needsRender = true;
}

function render() {
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const radius = Math.min(width, height) * baseRadius;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createRadialGradient(width * 0.35, height * 0.3, width * 0.1, width * 0.5, height * 0.55, width * 0.8);
  background.addColorStop(0, "rgba(46, 62, 120, 0.65)");
  background.addColorStop(1, "rgba(2, 5, 12, 0.95)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const data = [];

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const rotatedCenter = rotateVector(cell.center, rotationX, rotationY);

    if (rotatedCenter[2] <= 0) {
      continue;
    }

    const corners = [];
    let depthSum = 0;

    for (let c = 0; c < cell.corners.length; c += 1) {
      const corner = rotateVector(cell.corners[c], rotationX, rotationY);
      const scale = perspective / (perspective - corner[2]);
      const x = width / 2 + corner[0] * scale * radius;
      const y = height / 2 + corner[1] * scale * radius;
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

    const brightness = Math.max(0.2, 0.25 + 0.75 * Math.max(0, rotatedCenter[0] * lightDirection[0] + rotatedCenter[1] * lightDirection[1] + rotatedCenter[2] * lightDirection[2]));
    const alive = state[i] === 1;
    const color = alive
      ? aliveColor(brightness)
      : deadColor(brightness, rotatedCenter[2]);

    data.push({
      index: i,
      depth: depthSum / corners.length,
      path,
      color,
      corners,
      alive,
      center: rotatedCenter,
    });
  }

  data.sort((a, b) => a.depth - b.depth);
  projected = data;

  for (let i = 0; i < data.length; i += 1) {
    const item = data[i];
    ctx.fillStyle = item.color;
    ctx.fill(item.path);

    if (item.alive) {
      ctx.strokeStyle = "rgba(12, 22, 32, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke(item.path);
    }
  }

  const rimGradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.82, width / 2, height / 2, radius * 1.05);
  rimGradient.addColorStop(0, "rgba(8, 16, 32, 0)");
  rimGradient.addColorStop(1, "rgba(0, 0, 0, 0.6)");
  ctx.fillStyle = rimGradient;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, radius * 1.05, 0, Math.PI * 2);
  ctx.fill();
}

function aliveColor(brightness) {
  const r = Math.round(40 + brightness * 140);
  const g = Math.round(140 + brightness * 110);
  const b = Math.round(110 + brightness * 90);
  return `rgb(${r}, ${g}, ${b})`;
}

function deadColor(brightness, depth) {
  const horizon = Math.max(0, Math.min(1, 1 - depth));
  const r = Math.round(8 + brightness * 32 + horizon * 12);
  const g = Math.round(14 + brightness * 45 + horizon * 20);
  const b = Math.round(32 + brightness * 55 + horizon * 35);
  return `rgb(${r}, ${g}, ${b})`;
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
      needsRender = true;
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

  if (running && (timestamp - lastTick >= generationDelay)) {
    stepSimulation();
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

function setupControls() {
  toggleButton.addEventListener("click", () => {
    running = !running;
    toggleButton.textContent = running ? "Pause" : "Démarrer";
    if (running) {
      lastTick = performance.now();
    }
  });

  stepButton.addEventListener("click", () => {
    if (!running) {
      stepSimulation();
    }
  });

  randomizeButton.addEventListener("click", randomizeState);
  clearButton.addEventListener("click", clearState);
  speedInput.addEventListener("input", updateSpeed);
  resolutionInput.addEventListener("input", () => {
    buildSphere();
  });

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointerleave", () => {
    pointerActive = false;
    dragging = false;
  });
}

window.addEventListener("resize", () => {
  resizeCanvas();
});

setupControls();
resizeCanvas();
buildSphere();
updateSpeed();
randomizeState();
requestAnimationFrame(animationFrame);
