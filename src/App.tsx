import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Application,
  Container,
  NoiseFilter,
  Sprite,
  Texture,
} from 'pixi.js';

type AppCanvas = Application<HTMLCanvasElement>;

interface ThemeDefinition {
  label: string;
  background: string;
  backgroundSecondary: string;
  accent: string;
  accentSoft: string;
  accentGlow: string;
  text: string;
  textMuted: string;
  panel: string;
  panelBorder: string;
  gradient: string[];
  cellCore: string;
  cellMid: string;
  cellEdge: string;
  haloColor: string;
}

interface RuleDefinition {
  key: string;
  label: string;
  description: string;
  birth: number[];
  survive: number[];
}

interface SimulationConfig {
  cols: number;
  rows: number;
  cellSize: number;
  offsetX: number;
  offsetY: number;
}

interface CellVisual {
  container: Container;
  core: Sprite;
  aura: Sprite;
  alpha: number;
  auraAlpha: number;
  scale: number;
  jitter: number;
}

interface Stats {
  generation: number;
  alive: number;
  births: number;
  fades: number;
}

const THEMES: Record<string, ThemeDefinition> = {
  aurora: {
    label: 'Aurora Bloom',
    background:
      'radial-gradient(circle at 18% 12%, rgba(18, 8, 43, 0.96) 0%, rgba(7, 12, 36, 0.95) 45%, rgba(1, 2, 8, 0.94) 100%)',
    backgroundSecondary:
      'conic-gradient(from 120deg at 70% 40%, rgba(99, 234, 255, 0.18), rgba(255, 118, 214, 0.12), rgba(41, 19, 89, 0.25))',
    accent: '#ffbaf9',
    accentSoft: '#7ddff9',
    accentGlow: '#ffe0ff',
    text: '#f8f7ff',
    textMuted: 'rgba(218, 223, 255, 0.72)',
    panel: 'rgba(12, 16, 32, 0.62)',
    panelBorder: 'rgba(163, 203, 255, 0.25)',
    gradient: ['#a8f9ff', '#63d9ff', '#6a7bff', '#b76dff', '#ff6dd6', '#ffe6f3'],
    cellCore: '#fdfcff',
    cellMid: '#c7f1ff',
    cellEdge: '#6abaff',
    haloColor: 'rgba(120, 204, 255, 0.78)',
  },
  noir: {
    label: 'Midnight Vellum',
    background:
      'radial-gradient(circle at 80% 15%, rgba(30, 8, 32, 0.92), rgba(9, 6, 22, 0.94) 52%, rgba(2, 1, 9, 0.95) 100%)',
    backgroundSecondary:
      'conic-gradient(from 220deg at 25% 70%, rgba(255, 187, 92, 0.08), rgba(107, 210, 255, 0.14), rgba(36, 16, 64, 0.23))',
    accent: '#ffc978',
    accentSoft: '#ffdcb0',
    accentGlow: '#fff4d3',
    text: '#f5f0ff',
    textMuted: 'rgba(228, 210, 255, 0.7)',
    panel: 'rgba(19, 12, 33, 0.68)',
    panelBorder: 'rgba(255, 211, 158, 0.22)',
    gradient: ['#fff3dd', '#fbc488', '#ff956b', '#ff5c86', '#7c5bff', '#c9b2ff'],
    cellCore: '#fff8f0',
    cellMid: '#ffdcb2',
    cellEdge: '#ffa56d',
    haloColor: 'rgba(255, 174, 102, 0.78)',
  },
  lagoon: {
    label: 'Celestial Lagoon',
    background:
      'radial-gradient(circle at 50% 50%, rgba(4, 32, 45, 0.95) 0%, rgba(4, 16, 28, 0.96) 45%, rgba(1, 5, 12, 0.98) 100%)',
    backgroundSecondary:
      'conic-gradient(from 160deg at 60% 65%, rgba(40, 255, 220, 0.15), rgba(28, 87, 214, 0.18), rgba(10, 33, 58, 0.38))',
    accent: '#59ffd6',
    accentSoft: '#88ffe4',
    accentGlow: '#ddfff5',
    text: '#edffff',
    textMuted: 'rgba(198, 249, 255, 0.76)',
    panel: 'rgba(8, 23, 26, 0.65)',
    panelBorder: 'rgba(96, 255, 234, 0.22)',
    gradient: ['#9fffdc', '#5ce6ff', '#5b9dff', '#6b6eff', '#9b5cff', '#ff99f8'],
    cellCore: '#f4fff8',
    cellMid: '#b9fff0',
    cellEdge: '#4dd6ff',
    haloColor: 'rgba(86, 255, 227, 0.78)',
  },
};

const RULES: Record<string, RuleDefinition> = {
  classic: {
    key: 'classic',
    label: 'Conway Standard',
    description: 'Birth on 3, survive on 2-3. Organic balance of chaos and structure.',
    birth: [3],
    survive: [2, 3],
  },
  coral: {
    key: 'coral',
    label: 'Coral Reef',
    description: 'Birth on 3, survive on 4-8. Slowly growing coral formations.',
    birth: [3],
    survive: [4, 5, 6, 7, 8],
  },
  highlife: {
    key: 'highlife',
    label: 'HighLife',
    description: 'Birth on 3 and 6, survive on 2-3. Spirals and replicators emerge.',
    birth: [3, 6],
    survive: [2, 3],
  },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const lerp = (start: number, end: number, t: number): number => start + (end - start) * t;

const hexToNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

const lerpColor = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;

  const rr = Math.round(lerp(ar, br, t));
  const gg = Math.round(lerp(ag, bg, t));
  const bb2 = Math.round(lerp(ab, bb, t));

  return (rr << 16) + (gg << 8) + bb2;
};

const sampleGradient = (colors: number[], t: number): number => {
  if (colors.length === 0) {
    return 0xffffff;
  }
  if (colors.length === 1) {
    return colors[0];
  }

  const clamped = clamp(t, 0, 1) * (colors.length - 1);
  const index = Math.floor(clamped);
  const fraction = clamped - index;
  const colorA = colors[index];
  const colorB = colors[Math.min(colors.length - 1, index + 1)];

  return lerpColor(colorA, colorB, fraction);
};

const createCellTextures = (theme: ThemeDefinition): { core: Texture; halo: Texture } => {
  const baseSize = 128;
  const canvas = document.createElement('canvas');
  canvas.width = baseSize;
  canvas.height = baseSize;
  const context = canvas.getContext('2d');

  if (!context) {
    return { core: Texture.WHITE, halo: Texture.WHITE };
  }

  const gradient = context.createRadialGradient(
    baseSize / 2,
    baseSize / 2,
    baseSize * 0.1,
    baseSize / 2,
    baseSize / 2,
    baseSize * 0.48,
  );
  gradient.addColorStop(0, theme.cellCore);
  gradient.addColorStop(0.45, theme.cellMid);
  gradient.addColorStop(1, theme.cellEdge);

  context.fillStyle = gradient;
  context.fillRect(0, 0, baseSize, baseSize);

  const imageData = context.getImageData(0, 0, baseSize, baseSize);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 12;
    data[i] = clamp(data[i] + noise * 1.35, 0, 255);
    data[i + 1] = clamp(data[i + 1] + noise * 0.7, 0, 255);
    data[i + 2] = clamp(data[i + 2] + noise * 1.6, 0, 255);
  }
  context.putImageData(imageData, 0, 0);

  const core = Texture.from(canvas);

  const haloSize = baseSize * 2;
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloSize;
  haloCanvas.height = haloSize;
  const haloContext = haloCanvas.getContext('2d');

  if (!haloContext) {
    return { core, halo: core };
  }

  const haloGradient = haloContext.createRadialGradient(
    haloSize / 2,
    haloSize / 2,
    baseSize * 0.35,
    haloSize / 2,
    haloSize / 2,
    haloSize / 2,
  );
  haloGradient.addColorStop(0, theme.haloColor);
  haloGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  haloContext.fillStyle = haloGradient;
  haloContext.fillRect(0, 0, haloSize, haloSize);

  const halo = Texture.from(haloCanvas);

  return { core, halo };
};

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

const App = (): JSX.Element => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<AppCanvas | null>(null);
  const cellLayerRef = useRef<Container | null>(null);
  const configRef = useRef<SimulationConfig | null>(null);
  const stateRef = useRef<Uint8Array | null>(null);
  const nextStateRef = useRef<Uint8Array | null>(null);
  const energyRef = useRef<Float32Array | null>(null);
  const energyBufferRef = useRef<Float32Array | null>(null);
  const visualsRef = useRef<CellVisual[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const generationRef = useRef(0);

  const [running, setRunning] = useState(true);
  const runningRef = useRef(running);
  const [speed, setSpeed] = useState(0.58);
  const speedRef = useRef(speed);
  const [density, setDensity] = useState(0.42);
  const densityRef = useRef(density);
  const [themeKey, setThemeKey] = useState<keyof typeof THEMES>('aurora');
  const themeKeyRef = useRef<keyof typeof THEMES>('aurora');
  const themeRef = useRef<ThemeDefinition>(THEMES.aurora);
  const gradientRef = useRef<number[]>(THEMES.aurora.gradient.map(hexToNumber));
  const accentGlowRef = useRef<number>(hexToNumber(THEMES.aurora.accentGlow));
  const [ruleKey, setRuleKey] = useState<keyof typeof RULES>('classic');
  const ruleRef = useRef<{ birth: Set<number>; survive: Set<number> }>(
    {
      birth: new Set(RULES.classic.birth),
      survive: new Set(RULES.classic.survive),
    },
  );
  const [stats, setStats] = useState<Stats>({ generation: 0, alive: 0, births: 0, fades: 0 });
  const [totalCells, setTotalCells] = useState(0);

  const stepRef = useRef<(() => void) | null>(null);
  const randomizeRef = useRef<(() => void) | null>(null);
  const clearRef = useRef<(() => void) | null>(null);

  const textureCacheRef = useRef<Map<string, { core: Texture; halo: Texture }>>(new Map());

  const themeOptions = useMemo(
    () =>
      Object.entries(THEMES).map(([key, value]) => ({
        key,
        label: value.label,
      })),
    [],
  );

  const ruleOptions = useMemo(
    () =>
      Object.values(RULES).map((rule) => ({
        key: rule.key,
        label: rule.label,
      })),
    [],
  );

  const applyThemeToCss = useCallback((theme: ThemeDefinition) => {
    const root = document.documentElement;
    root.style.setProperty('--background-gradient', theme.background);
    root.style.setProperty('--background-overlay', theme.backgroundSecondary);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-soft', theme.accentSoft);
    root.style.setProperty('--accent-glow', theme.accentGlow);
    root.style.setProperty('--panel-background', theme.panel);
    root.style.setProperty('--panel-border', theme.panelBorder);
    root.style.setProperty('--text-primary', theme.text);
    root.style.setProperty('--text-muted', theme.textMuted);
  }, []);

  const getTextures = useCallback(
    (key: string): { core: Texture; halo: Texture } => {
      const cache = textureCacheRef.current.get(key);
      if (cache) {
        return cache;
      }
      const textures = createCellTextures(THEMES[key]);
      textureCacheRef.current.set(key, textures);
      return textures;
    },
    [],
  );

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    densityRef.current = density;
  }, [density]);

  useEffect(() => {
    const theme = THEMES[themeKey];
    themeKeyRef.current = themeKey;
    themeRef.current = theme;
    gradientRef.current = theme.gradient.map(hexToNumber);
    accentGlowRef.current = hexToNumber(theme.accentGlow);
    applyThemeToCss(theme);

    const textures = getTextures(themeKey);
    visualsRef.current.forEach((visual) => {
      visual.core.texture = textures.core;
      visual.aura.texture = textures.halo;
    });
  }, [themeKey, applyThemeToCss, getTextures]);

  useEffect(() => {
    const rule = RULES[ruleKey];
    ruleRef.current = {
      birth: new Set(rule.birth),
      survive: new Set(rule.survive),
    };
  }, [ruleKey]);

  useEffect(() => {
    let destroyed = false;
    let cleanup: (() => void) | undefined;

    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const app = new Application<HTMLCanvasElement>();

    const initialize = async (): Promise<void> => {
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
      });

      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }

      app.stage.filters = [new NoiseFilter({ noise: 0.025, seed: Math.random() * 1000 })];
      appRef.current = app;
      host.appendChild(app.canvas);

      const pointerMove = (event: { global: { x: number; y: number } }): void => {
        pointerRef.current = { x: event.global.x, y: event.global.y };
      };
      const pointerLeave = (): void => {
        pointerRef.current = null;
      };

      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;
      app.stage.on('pointermove', pointerMove);
      app.stage.on('pointerdown', pointerMove);
      app.stage.on('pointerleave', pointerLeave);

      const rebuildGrid = (): void => {
        const { width, height } = app.renderer;

        if (cellLayerRef.current) {
          cellLayerRef.current.destroy({ children: true });
          cellLayerRef.current = null;
        }

        const area = width * height;
        const targetCells = clamp(Math.round(area / 650), 1200, 9800);
        const cellSize = clamp(Math.sqrt((width * height) / targetCells), 12, 28);
        const cols = Math.floor(width / cellSize);
        const rows = Math.floor(height / cellSize);
        const offsetX = (width - cols * cellSize) / 2 + cellSize / 2;
        const offsetY = (height - rows * cellSize) / 2 + cellSize / 2;

        const length = cols * rows;
        stateRef.current = new Uint8Array(length);
        nextStateRef.current = new Uint8Array(length);
        energyRef.current = new Float32Array(length);
        energyBufferRef.current = new Float32Array(length);
        visualsRef.current = [];
        configRef.current = { cols, rows, cellSize, offsetX, offsetY };
        generationRef.current = 0;
        setStats({ generation: 0, alive: 0, births: 0, fades: 0 });
        setTotalCells(length);

        const textures = getTextures(themeKeyRef.current);

        const cellLayer = new Container();
        cellLayerRef.current = cellLayer;
        app.stage.addChild(cellLayer);

        for (let y = 0; y < rows; y += 1) {
          for (let x = 0; x < cols; x += 1) {
            const container = new Container();
            const aura = new Sprite(textures.halo);
            aura.anchor.set(0.5);
            aura.alpha = 0;
            aura.scale.set(1.75);
            aura.blendMode = 'add';

            const core = new Sprite(textures.core);
            core.anchor.set(0.5);
            core.alpha = 0;
            core.blendMode = 'screen';

            container.addChild(aura);
            container.addChild(core);
            container.x = offsetX + x * cellSize;
            container.y = offsetY + y * cellSize;
            container.scale.set(0.3);
            container.rotation = Math.random() * Math.PI * 2;

            cellLayer.addChild(container);

            visualsRef.current.push({
              container,
              core,
              aura,
              alpha: 0,
              auraAlpha: 0,
              scale: 0.3,
              jitter: Math.random() * Math.PI * 2,
            });
          }
        }

        const randomize = (): void => {
          const state = stateRef.current;
          const energy = energyRef.current;
          const next = nextStateRef.current;
          const energyBuffer = energyBufferRef.current;
          if (!state || !energy || !next || !energyBuffer) {
            return;
          }

          let aliveCount = 0;
          for (let i = 0; i < state.length; i += 1) {
            const alive = Math.random() < densityRef.current;
            if (alive) {
              const age = Math.floor(Math.random() * 5) + 1;
              state[i] = age;
              energy[i] = age * 6;
              aliveCount += 1;
            } else {
              state[i] = 0;
              energy[i] = 0;
            }
            next[i] = 0;
            energyBuffer[i] = 0;
          }
          generationRef.current = 0;
          if (!destroyed) {
            setStats({ generation: 0, alive: aliveCount, births: aliveCount, fades: 0 });
          }
        };

        const clear = (): void => {
          stateRef.current?.fill(0);
          nextStateRef.current?.fill(0);
          energyRef.current?.fill(0);
          energyBufferRef.current?.fill(0);
          generationRef.current = 0;
          if (!destroyed) {
            setStats({ generation: 0, alive: 0, births: 0, fades: 0 });
          }
        };

        const stepSimulation = (): void => {
          const state = stateRef.current;
          const next = nextStateRef.current;
          const energy = energyRef.current;
          const energyNext = energyBufferRef.current;
          const config = configRef.current;
          const rule = ruleRef.current;

          if (!state || !next || !energy || !energyNext || !config || !rule) {
            return;
          }

          const { cols, rows } = config;
          let aliveCount = 0;
          let births = 0;
          let fades = 0;

          for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
              const index = y * cols + x;
              const age = state[index];
              const alive = age > 0;
              let neighbors = 0;
              let neighborAge = 0;
              let neighborEnergy = 0;

              for (let ny = -1; ny <= 1; ny += 1) {
                const yy = y + ny;
                if (yy < 0 || yy >= rows) {
                  continue;
                }

                for (let nx = -1; nx <= 1; nx += 1) {
                  if (nx === 0 && ny === 0) {
                    continue;
                  }
                  const xx = x + nx;
                  if (xx < 0 || xx >= cols) {
                    continue;
                  }
                  const neighborIndex = yy * cols + xx;
                  const neighborAgeValue = state[neighborIndex];
                  if (neighborAgeValue > 0) {
                    neighbors += 1;
                    neighborAge += neighborAgeValue;
                    neighborEnergy += energy[neighborIndex];
                  }
                }
              }

              let newAge = 0;
              if (alive) {
                if (rule.survive.has(neighbors)) {
                  newAge = Math.min(200, age + 1);
                }
              } else if (rule.birth.has(neighbors)) {
                newAge = 1;
              }

              if (newAge > 0) {
                aliveCount += 1;
              }
              if (!alive && newAge > 0) {
                births += 1;
              }
              if (alive && newAge === 0) {
                fades += 1;
              }

              next[index] = newAge;

              const neighborAgeAverage = neighbors > 0 ? neighborAge / neighbors : 0;
              const neighborEnergyAverage = neighbors > 0 ? neighborEnergy / neighbors : 0;
              const targetEnergy = newAge > 0
                ? newAge * 6 + neighborAgeAverage * 1.2 + neighborEnergyAverage * 0.35
                : neighborAgeAverage * 0.8;
              const blended = energy[index] * 0.55 + targetEnergy * 0.45;
              energyNext[index] = blended;
            }
          }

          stateRef.current = next;
          nextStateRef.current = state;
          energyRef.current = energyNext;
          energyBufferRef.current = energy;

          generationRef.current += 1;
          if (!destroyed) {
            setStats({
              generation: generationRef.current,
              alive: aliveCount,
              births,
              fades,
            });
          }
        };

        randomizeRef.current = randomize;
        clearRef.current = clear;
        stepRef.current = stepSimulation;

        randomize();
      };

      rebuildGrid();

      const handleResize = (): void => {
        rebuildGrid();
      };

      window.addEventListener('resize', handleResize);

      const timeState = { current: 0 };
      let accumulator = 0;

      const updateVisuals = (_deltaMS: number): void => {
        const state = stateRef.current;
        const energy = energyRef.current;
        const visuals = visualsRef.current;
        const config = configRef.current;
        const theme = themeRef.current;
        const gradient = gradientRef.current;
        const accentGlow = accentGlowRef.current;

        if (!state || !visuals || !config || !theme) {
          return;
        }

        const pointer = pointerRef.current;

        for (let i = 0; i < visuals.length; i += 1) {
          const visual = visuals[i];
          const age = state[i];
          const alive = age > 0;
          const energyValue = energy ? energy[i] : 0;
          const energyNorm = clamp(energyValue / 180, 0, 1);

          const baseAlpha = alive ? 0.32 + Math.min(0.6, age / 32 + energyNorm * 0.5) : 0;
          visual.alpha += (baseAlpha - visual.alpha) * 0.08;

          const harmonic = Math.sin(timeState.current * 0.0011 + visual.jitter + energyNorm * 2.8);
          const neighborPulse = energyNorm * 0.45 + harmonic * 0.08;
          let targetScale = alive ? 0.55 + Math.min(0.75, age / 90) + neighborPulse : 0.24;

          if (pointer) {
            const dx = visual.container.x - pointer.x;
            const dy = visual.container.y - pointer.y;
            const distance = Math.hypot(dx, dy);
            const influence = Math.max(0, 1 - distance / (config.cellSize * 12));
            targetScale += influence * 0.25;
          }

          visual.scale += (targetScale - visual.scale) * 0.09;
          visual.container.scale.set(visual.scale);

          const rotationTarget = alive ? harmonic * 0.3 * (0.45 + energyNorm * 0.6) : 0;
          visual.container.rotation += (rotationTarget - visual.container.rotation) * 0.07;

          visual.core.alpha = visual.alpha;
          const auraTarget = alive ? visual.alpha * (0.55 + energyNorm * 0.7) : 0;
          visual.auraAlpha += (auraTarget - visual.auraAlpha) * 0.1;
          visual.aura.alpha = visual.auraAlpha;
          visual.aura.scale.set(1.6 + energyNorm * 0.75);

          const color = sampleGradient(gradient, Math.min(1, age / 18 + energyNorm * 0.55));
          visual.core.tint = color;
          const auraColor = sampleGradient(gradient, Math.min(1, energyNorm + 0.35));
          visual.aura.tint = lerpColor(auraColor, accentGlow, 0.35);
        }
      };

      const ticker = (tickerInfo: { deltaMS: number }): void => {
        if (destroyed) {
          return;
        }
        timeState.current += tickerInfo.deltaMS;
        accumulator += tickerInfo.deltaMS;
        const stepDuration = 120 + (1 - speedRef.current) * 720;

        if (runningRef.current && stepRef.current) {
          while (accumulator >= stepDuration) {
            stepRef.current();
            accumulator -= stepDuration;
          }
        } else {
          accumulator = Math.min(accumulator, stepDuration);
        }

        updateVisuals(tickerInfo.deltaMS);
      };

      app.ticker.add(ticker);

      const rendererResize = (): void => {
        pointerRef.current = null;
      };
      app.renderer.on('resize', rendererResize);

      (app.view as HTMLCanvasElement).style.filter = 'drop-shadow(0 0 50px rgba(255, 255, 255, 0.08))';
      app.stage.sortableChildren = false;

      cleanup = () => {
        window.removeEventListener('resize', handleResize);
        app.ticker.remove(ticker);
        app.stage.off('pointermove', pointerMove);
        app.stage.off('pointerdown', pointerMove);
        app.stage.off('pointerleave', pointerLeave);
        app.renderer.off('resize', rendererResize);
        randomizeRef.current = null;
        clearRef.current = null;
        stepRef.current = null;
        cellLayerRef.current?.destroy({ children: true });
        cellLayerRef.current = null;
      };
    };

    initialize().catch(() => {
      // ignore initialization errors in this context
    });

    return () => {
      destroyed = true;
      cleanup?.();
      if (appRef.current === app) {
        appRef.current = null;
      }
      app.destroy(true, { children: true });
      textureCacheRef.current.forEach((texture) => {
        texture.core.destroy(true);
        texture.halo.destroy(true);
      });
      textureCacheRef.current.clear();
    };
  }, [getTextures]);

  const handleToggle = useCallback(() => {
    setRunning((prev) => !prev);
  }, []);

  const handleStep = useCallback(() => {
    if (stepRef.current) {
      stepRef.current();
    }
  }, []);

  const handleRandomize = useCallback(() => {
    randomizeRef.current?.();
  }, []);

  const handleClear = useCallback(() => {
    clearRef.current?.();
  }, []);

  const handleSpeedChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSpeed(Number(event.target.value));
  }, []);

  const handleDensityChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDensity(Number(event.target.value));
  }, []);

  const handleThemeChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setThemeKey(event.target.value as keyof typeof THEMES);
  }, []);

  const handleRuleChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setRuleKey(event.target.value as keyof typeof RULES);
  }, []);

  const theme = THEMES[themeKey];
  const currentRule = RULES[ruleKey];
  const aliveRatio = totalCells > 0 ? stats.alive / totalCells : 0;

  return (
    <div className="app-shell" style={{ backgroundImage: theme.background }}>
      <div className="app-shell__atmosphere" />
      <div className="app-shell__aurora" />
      <div className="app-shell__grain" />
      <div ref={hostRef} className="app-shell__canvas" />

      <div className="hud">
        <div className="hud__brand">
          <span className="hud__subtitle">Living Sculpture Studio</span>
          <h1 className="hud__title">Lumen Life Observatory</h1>
          <p className="hud__description">
            An immersive interpretation of Conway’s Game of Life. Shape luminous colonies, adjust their rhythms, and watch
            intricate harmonies ripple across a nebular tapestry.
          </p>
        </div>
        <div className="hud__stats">
          <div className="hud__stat">
            <span className="hud__stat-label">Generation</span>
            <span className="hud__stat-value">{stats.generation.toLocaleString()}</span>
          </div>
          <div className="hud__stat">
            <span className="hud__stat-label">Alive</span>
            <span className="hud__stat-value">{stats.alive.toLocaleString()}</span>
          </div>
          <div className="hud__stat">
            <span className="hud__stat-label">Bloom</span>
            <span className="hud__stat-value">{stats.births.toLocaleString()}</span>
          </div>
          <div className="hud__stat">
            <span className="hud__stat-label">Fade</span>
            <span className="hud__stat-value">{stats.fades.toLocaleString()}</span>
          </div>
          <div className="hud__progress">
            <div className="hud__progress-indicator" style={{ width: `${Math.min(100, aliveRatio * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="control-panel">
        <div className="control-panel__inner">
          <div className="control-panel__row control-panel__row--primary">
            <button type="button" className="control-panel__button control-panel__button--accent" onClick={handleToggle}>
              {running ? 'Pause Pulse' : 'Resume Flow'}
            </button>
            <button type="button" className="control-panel__button" onClick={handleStep}>
              Step Once
            </button>
            <button type="button" className="control-panel__button" onClick={handleRandomize}>
              Seed Nebula
            </button>
            <button type="button" className="control-panel__button" onClick={handleClear}>
              Clear Canvas
            </button>
          </div>
          <div className="control-panel__row">
            <label className="control-panel__field">
              <span>Tempo</span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={speed}
                onChange={handleSpeedChange}
              />
            </label>
            <label className="control-panel__field">
              <span>Seed Density</span>
              <input
                type="range"
                min={0.05}
                max={0.8}
                step={0.01}
                value={density}
                onChange={handleDensityChange}
              />
            </label>
            <div className="control-panel__field control-panel__field--info">
              <span>Occupancy</span>
              <strong>{formatPercent(aliveRatio)}</strong>
            </div>
          </div>
          <div className="control-panel__row control-panel__row--selects">
            <label className="control-panel__field">
              <span>Chromatic Theme</span>
              <select value={themeKey} onChange={handleThemeChange}>
                {themeOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-panel__field">
              <span>Rule Symphony</span>
              <select value={ruleKey} onChange={handleRuleChange}>
                {ruleOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="control-panel__field control-panel__field--info">
              <span>Current Motif</span>
              <p>{currentRule.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="legend">
        <div className="legend__item">
          <span className="legend__dot legend__dot--pulse" />
          <span>Warm cores indicate newly born cells resonating with their neighbors.</span>
        </div>
        <div className="legend__item">
          <span className="legend__dot legend__dot--halo" />
          <span>Expansive halos reveal communal energy shared across the colony.</span>
        </div>
        <div className="legend__item">
          <span className="legend__dot legend__dot--lull" />
          <span>Dim embers fade gracefully as life recedes into the void.</span>
        </div>
      </div>
    </div>
  );
};

export default App;
