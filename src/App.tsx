import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Application,
  Assets,
  Filter,
  Sprite,
  Texture,
} from 'pixi.js';

const fragmentShader = `
precision mediump float;

varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform sampler2D normalMap;
uniform vec2 lightPos;
uniform float noiseAmount;
uniform float time;

float rand(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main(void) {
  vec4 baseColor = texture2D(uSampler, vTextureCoord);
  vec3 normal = normalize(texture2D(normalMap, vTextureCoord).rgb * 2.0 - 1.0);
  vec2 lightVector = lightPos - vTextureCoord;
  vec3 lightDir = normalize(vec3(lightVector, 0.35));

  float diffuse = max(dot(normal, lightDir), 0.0);
  float rim = pow(1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0), 1.5);
  float falloff = 0.9 / (1.0 + 6.0 * dot(lightVector, lightVector));

  float ambient = 0.25;
  float lightContribution = ambient + diffuse * falloff + rim * 0.35;

  float noise = (rand(vTextureCoord * (time * 25.0)) - 0.5) * noiseAmount;
  vec3 finalColor = baseColor.rgb * clamp(lightContribution, 0.0, 1.2) + noise;
  finalColor = clamp(finalColor, 0.0, 1.0);

  gl_FragColor = vec4(finalColor, baseColor.a);
}
`;

type AppCanvas = Application<HTMLCanvasElement>;

const createGradientDataUrl = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext('2d');
  if (!context) {
    return 'data:image/png;base64,';
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#f9f5eb');
  gradient.addColorStop(0.35, '#d7c4a5');
  gradient.addColorStop(0.75, '#8a6d4f');
  gradient.addColorStop(1, '#3b2a1f');

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = 0.35;
  context.fillStyle = '#ffffff';
  for (let i = 0; i < 2200; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radius = Math.random() * 2 + 0.5;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  return canvas.toDataURL('image/png');
};

const createNormalMapDataUrl = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext('2d');
  if (!context) {
    return 'data:image/png;base64,';
  }

  const baseNormal = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  baseNormal.addColorStop(0, 'rgb(170, 170, 255)');
  baseNormal.addColorStop(1, 'rgb(90, 90, 255)');
  context.fillStyle = baseNormal;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = 0.25;
  for (let i = 0; i < 1200; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const value = Math.random() * 20 - 10;
    const red = 128 + value;
    const green = 128 - value;
    const blue = 255;
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.fillRect(x, y, 2, 2);
  }

  return canvas.toDataURL('image/png');
};

const createDefaultAssets = async (): Promise<{ color: Texture; normal: Texture }> => {
  const colorUrl = createGradientDataUrl();
  const normalUrl = createNormalMapDataUrl();
  const [color, normal] = await Promise.all([
    Assets.load<Texture>(colorUrl),
    Assets.load<Texture>(normalUrl),
  ]);

  return { color, normal };
};

const App = (): JSX.Element => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<AppCanvas | null>(null);
  const spriteRef = useRef<Sprite | null>(null);
  const filterRef = useRef<Filter | null>(null);
  const [grain, setGrain] = useState(0.15);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialGrainRef = useRef(grain);

  const fitSprite = useCallback(() => {
    const app = appRef.current;
    const sprite = spriteRef.current;
    if (!app || !sprite) {
      return;
    }

    const texture = sprite.texture;
    const { width, height } = texture;
    if (width === 0 || height === 0) {
      return;
    }

    const scale = Math.max(app.screen.width / width, app.screen.height / height);
    sprite.scale.set(scale);
    sprite.position.set(app.screen.width / 2, app.screen.height / 2);
  }, []);

  useEffect(() => {
    let isUnmounted = false;
    let destroy: (() => void) | undefined;

    const cleanupApplication = () => {
      if (destroy) {
        destroy();
        destroy = undefined;
      }
    };

    const setup = async () => {
      const app = new Application();
      let colorTexture: Texture | undefined;
      let normalTexture: Texture | undefined;
      let tickerCallback: ((delta: number) => void) | undefined;

      try {
        await app.init({
          backgroundAlpha: 1,
          background: '#050505',
          resizeTo: window,
          antialias: true,
        });

        if (isUnmounted) {
          app.destroy(true);
          return;
        }

        appRef.current = app;

        if (hostRef.current) {
          hostRef.current.innerHTML = '';
          hostRef.current.appendChild(app.canvas);
        }

        const assets = await createDefaultAssets();
        colorTexture = assets.color;
        normalTexture = assets.normal;

        if (isUnmounted) {
          colorTexture.destroy(true);
          normalTexture.destroy(true);
          app.destroy(true);
          if (appRef.current === app) {
            appRef.current = null;
          }
          return;
        }

        const sprite = new Sprite(colorTexture);
        sprite.anchor.set(0.5);
        spriteRef.current = sprite;

        const filter = new Filter(undefined, fragmentShader, {
          normalMap: normalTexture,
          lightPos: new Float32Array([0.5, 0.5]),
          noiseAmount: initialGrainRef.current,
          time: 0,
        });

        filterRef.current = filter;
        sprite.filters = [filter];

        app.stage.addChild(sprite);
        fitSprite();

        let elapsed = 0;
        tickerCallback = (delta: number) => {
          elapsed += delta / 60;
          if (filterRef.current) {
            filterRef.current.uniforms.time = elapsed;
          }
        };
        app.ticker.add(tickerCallback);

        const handlePointerMove = (event: PointerEvent) => {
          if (!filterRef.current || !appRef.current) {
            return;
          }

          const rect = appRef.current.canvas.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          const uniforms = filterRef.current.uniforms as Record<string, unknown>;
          const light = uniforms.lightPos as Float32Array | number[] | undefined;
          if (light instanceof Float32Array) {
            light[0] = x;
            light[1] = 1.0 - y;
          } else {
            filterRef.current.uniforms.lightPos = new Float32Array([x, 1.0 - y]);
          }
        };

        const resetLight = () => {
          if (filterRef.current) {
            const uniforms = filterRef.current.uniforms as Record<string, unknown>;
            const light = uniforms.lightPos as Float32Array | number[] | undefined;
            if (light instanceof Float32Array) {
              light[0] = 0.5;
              light[1] = 0.5;
            } else {
              filterRef.current.uniforms.lightPos = new Float32Array([0.5, 0.5]);
            }
          }
        };

        app.canvas.addEventListener('pointermove', handlePointerMove);
        app.canvas.addEventListener('pointerleave', resetLight);
        window.addEventListener('resize', fitSprite);

        destroy = () => {
          app.canvas.removeEventListener('pointermove', handlePointerMove);
          app.canvas.removeEventListener('pointerleave', resetLight);
          window.removeEventListener('resize', fitSprite);
          if (tickerCallback) {
            app.ticker.remove(tickerCallback);
          }
          app.destroy(true);
          colorTexture?.destroy(true);
          normalTexture?.destroy(true);
          if (appRef.current === app) {
            appRef.current = null;
          }
          if (spriteRef.current === sprite) {
            spriteRef.current = null;
          }
          if (filterRef.current === filter) {
            filterRef.current = null;
          }
        };
      } catch (error) {
        if (tickerCallback) {
          app.ticker.remove(tickerCallback);
        }
        app.destroy(true);
        colorTexture?.destroy(true);
        normalTexture?.destroy(true);
        throw error;
      }
    };

    setup().catch((error) => {
      console.error('Failed to initialize Atelier Lumière', error);
    }).finally(() => {
      if (isUnmounted) {
        cleanupApplication();
      }
    });

    return () => {
      isUnmounted = true;
      cleanupApplication();
    };
  }, [fitSprite]);

  useEffect(() => {
    initialGrainRef.current = grain;
    if (filterRef.current) {
      filterRef.current.uniforms.noiseAmount = grain;
    }
  }, [grain]);

  const handleLoadArtwork = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      if (!files || files.length === 0) {
        return;
      }

      const selected = Array.from(files);
      let colorFile: File | undefined;
      let normalFile: File | undefined;

      selected.forEach((file) => {
        const name = file.name.toLowerCase();
        if (!colorFile || name.includes('color') || name.includes('albedo')) {
          colorFile = file;
        }
        if (name.includes('normal') || name.endsWith('_n.png') || name.endsWith('_n.jpg')) {
          normalFile = file;
        }
      });

      if (!colorFile) {
        colorFile = selected[0];
      }

      if (!normalFile && selected.length > 1) {
        normalFile = selected.find((file) => file !== colorFile);
      }

      const app = appRef.current;
      const sprite = spriteRef.current;
      const filter = filterRef.current;

      if (!app || !sprite || !filter) {
        return;
      }

      if (colorFile) {
        const url = URL.createObjectURL(colorFile);
        try {
          const texture = await Assets.load<Texture>(url);
          sprite.texture = texture;
          sprite.texture.baseTexture.once('update', fitSprite);
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      if (normalFile) {
        const url = URL.createObjectURL(normalFile);
        try {
          const texture = await Assets.load<Texture>(url);
          filter.uniforms.normalMap = texture;
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      fitSprite();
      event.target.value = '';
    },
    [fitSprite],
  );

  const handleScreenshot = useCallback(() => {
    const app = appRef.current;
    if (!app) {
      return;
    }

    const canvas = app.renderer.extract.canvas(app.stage);
    const dataUrl = canvas.toDataURL('image/png', 1.0);

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `capture-${Date.now()}.png`;
    link.click();
  }, []);

  return (
    <div className="relative flex h-screen w-screen flex-col bg-atelier-dark">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-between p-6 text-sm uppercase tracking-[0.35em] text-neutral-300">
        <span className="hidden md:inline">Atelier Lumière</span>
        <span className="pointer-events-auto rounded-full bg-neutral-800/70 px-4 py-1 text-xs font-semibold text-neutral-200 shadow-lg shadow-black/40">
          Déplacez la souris pour éclairer
        </span>
        <span className="hidden md:inline text-right">Normal map &amp; grain dynamique</span>
      </header>

      <main className="relative flex h-full flex-1">
        <div ref={hostRef} className="h-full w-full" />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-6 pb-8">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-full bg-neutral-900/80 px-6 py-3 shadow-xl shadow-black/40 backdrop-blur">
            <button
              type="button"
              onClick={handleLoadArtwork}
              className="rounded-full bg-atelier-accent px-5 py-2 text-sm font-semibold uppercase tracking-widest text-neutral-900 transition hover:bg-amber-300"
            >
              Charger une œuvre
            </button>
            <button
              type="button"
              onClick={handleScreenshot}
              className="rounded-full border border-neutral-700 px-5 py-2 text-sm font-semibold uppercase tracking-widest text-neutral-200 transition hover:bg-neutral-100/10"
            >
              Screenshot
            </button>
            <label className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
              Grain
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.01}
                value={grain}
                onChange={(event) => setGrain(Number(event.target.value))}
                className="h-1 w-36 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-atelier-accent"
              />
            </label>
          </div>
        </div>
      </main>

      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={handleFiles}
      />
    </div>
  );
};

export default App;
