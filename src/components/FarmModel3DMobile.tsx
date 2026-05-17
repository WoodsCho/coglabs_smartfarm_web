// Mobile-only 3D view — independent from FarmModel3D.tsx
// Landscape-first · safe-area aware · touch-optimized

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  ACESFilmicToneMapping, Box3, BufferAttribute, BufferGeometry,
  Color, DoubleSide, StaticDrawUsage, InstancedMesh, Matrix4,
  Mesh, PerspectiveCamera, Quaternion, ShaderMaterial, Vector3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useWeather } from '../hooks/useWeather';
import { useFarm } from '../contexts/FarmContext';
import type { WeatherState } from '../hooks/useWeather';
import type { EnvironmentData } from '../types/farm';
import { equipmentApi } from '../api/equipment';
import ActivityTimeline from './ActivityTimeline';
import Chatbot from './Chatbot';
import './FarmModel3DMobile.css';

// ── Sky color sync (mirrors WeatherLighting scene.background) ──
function lerpRGB(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function computeSkyInfo(weather: WeatherState): { bg: string; isDark: boolean } {
  if (weather.loading) return { bg: 'rgb(10,15,30)', isDark: true };
  const { isDay, sunProgress, condition } = weather;
  let rgb: [number, number, number];
  if (!isDay)                                          rgb = [10, 15, 30];
  else if (condition === 'rain' || condition === 'thunderstorm') rgb = [74, 85, 104];
  else if (condition === 'clouds')                     rgb = [158, 175, 194];
  else if (condition === 'mist')                       rgb = [200, 212, 220];
  else if (sunProgress < 0.15) rgb = lerpRGB([249, 115, 22], [96, 165, 250], sunProgress / 0.15);
  else if (sunProgress > 0.85) rgb = lerpRGB([96, 165, 250], [249, 115, 22], (sunProgress - 0.85) / 0.15);
  else                                                 rgb = [135, 206, 235];
  const [r, g, b] = rgb;
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return { bg: `rgb(${r},${g},${b})`, isDark: lum < 0.35 };
}

// ── Draco decoder ────────────────────────────────────────
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/gltf/');
dracoLoader.setDecoderConfig({ type: 'js' });
const setupLoader = (loader: GLTFLoader) => { loader.setDRACOLoader(dracoLoader); };

// ── Material helpers ─────────────────────────────────────
function applyMaterialDefaults(root: any) {
  root.traverse((obj: any) => {
    if (!(obj instanceof Mesh)) return;
    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((mat: any) => {
      if (!mat) return;
      mat.side = DoubleSide;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = 1;
      mat.polygonOffsetUnits = 1;
      mat.needsUpdate = true;
    });
  });
}

function deduplicateMaterials(root: any) {
  const cache = new Map<string, any>();
  const matKey = (mat: any): string => {
    if (!mat?.isMeshStandardMaterial && !mat?.isMeshPhysicalMaterial) return mat?.uuid ?? '';
    const c = mat.color; const e = mat.emissive;
    return [
      c.r.toFixed(3), c.g.toFixed(3), c.b.toFixed(3),
      (mat.opacity ?? 1).toFixed(2), (mat.roughness ?? 1).toFixed(2), (mat.metalness ?? 0).toFixed(2),
      mat.transparent ? '1' : '0', mat.map?.uuid ?? '0',
      e ? `${e.r.toFixed(2)},${e.g.toFixed(2)},${e.b.toFixed(2)}` : '0',
      (mat.emissiveIntensity ?? 0).toFixed(2),
    ].join('|');
  };
  root.traverse((obj: any) => {
    if (!(obj instanceof Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const merged = mats.map((mat: any) => {
      const key = matKey(mat);
      if (!key) return mat;
      if (cache.has(key)) return cache.get(key);
      cache.set(key, mat); return mat;
    });
    obj.material = Array.isArray(obj.material) ? merged : merged[0];
  });
}

// ── Equipment button definitions ─────────────────────────
const EQUIP_BUTTON_DEFS = [
  { key: 'fan_coil_button', label: '팬코일', icon: '❄️', equipmentIds: [8] },
  { key: 'heat_pump_button', label: '히트펌프', icon: '🌡️', equipmentIds: [9] },
  { key: 'nutrient_return_button', label: '양액 회수', icon: '�', equipmentIds: [6] },
  { key: 'nutrient_supply_button', label: '양액 공급', icon: '💧', equipmentIds: [7] },
  { key: 'nutrient_a_button', label: '양액 A', icon: '🧪', equipmentIds: [13] },
  { key: 'nutrient_b_button', label: '양액 B', icon: '🧫', equipmentIds: [12] },
  { key: 'mixer_button', label: '믹서', icon: '🔄', equipmentIds: [11] },
  { key: 'led1_button', label: 'LED 1', icon: '💡', equipmentIds: [], ledId: 1 },
  { key: 'led2_button', label: 'LED 2', icon: '💡', equipmentIds: [], ledId: 2 },
  { key: 'led3_button', label: 'LED 3', icon: '💡', equipmentIds: [], ledId: 3 },
] as const;

const EQUIP_COLORS: Record<string, string> = {
  fan_coil_button: '#60A5FA',
  heat_pump_button: '#F97316',
  nutrient_return_button: '#34D399',
  nutrient_supply_button: '#2DD4BF',
  nutrient_a_button: '#4ADE80',
  nutrient_b_button: '#22D3EE',
  mixer_button: '#A78BFA',
  led1_button: '#FDE047',
  led2_button: '#FB923C',
  led3_button: '#F472B6',
};

export interface EquipButtonPos {
  key: string; label: string; icon: string;
  equipmentIds: number[]; ledId?: number;
  x: number; y: number;
}

// ── Camera & scene positions ─────────────────────────────
const OVERVIEW_POS = new Vector3(37.62, 14.43, -37.44);
const OVERVIEW_TARGET = new Vector3(11.53, 10.76, -10.74);
const PIPELINE1_POS = new Vector3(27.4, 15.5, -26.8);
const PIPELINE1_TARGET = new Vector3(9.9, 4.00, -4.9);
const PLANT_CHECK_POS = new Vector3(8.41, 6.46, -1.64);
const PLANT_CHECK_TARGET = new Vector3(8.45, 6.42, 0.36);

// ── Camera controls ──────────────────────────────────────
type AnimTarget = { toPos: Vector3; toTarget: Vector3 } | null;

function MobileCameraControls({
  animRef,
}: {
  animRef: React.MutableRefObject<AnimTarget>;
}) {
  const { camera, gl } = useThree();
  const ctrlRef = useRef<any>(null);
  useEffect(() => {
    const ctrl = new OrbitControls(camera, gl.domElement);
    ctrl.target.copy(OVERVIEW_TARGET);
    ctrl.enableDamping = true; ctrl.dampingFactor = 0.1;
    ctrl.minDistance = 5; ctrl.maxDistance = 120;
    ctrl.maxPolarAngle = Math.PI / 2;
    ctrl.rotateSpeed = 0.6; ctrl.zoomSpeed = 0.8;
    ctrlRef.current = ctrl;
    return () => { ctrl.dispose(); ctrlRef.current = null; };
  }, [camera, gl.domElement]);
  useFrame(() => {
    const ctrl = ctrlRef.current; if (!ctrl) return;
    if (animRef.current) {
      const { toPos, toTarget } = animRef.current;
      camera.position.lerp(toPos, 0.06);
      ctrl.target.lerp(toTarget, 0.06);
      if (camera.position.distanceTo(toPos) < 0.3) {
        camera.position.copy(toPos); ctrl.target.copy(toTarget); animRef.current = null;
      }
    }
    ctrl.update();
  });
  return null;
}

// ── Grass field (2000 blades, mobile-optimized) ──────────
const GRASS_VERT = `
  uniform float uTime; uniform float uWindStrength;
  attribute float aRandom; attribute float aHeight;
  varying vec2 vUv; varying float vHeight;
  void main() {
    vUv = uv; vHeight = position.y / aHeight;
    float sway = sin(uTime*1.8+aRandom*6.28)*uWindStrength*vHeight*vHeight;
    float swayZ = cos(uTime*1.3+aRandom*3.14)*uWindStrength*0.4*vHeight*vHeight;
    vec3 pos = position; pos.x += sway; pos.z += swayZ;
    gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(pos,1.0);
  }
`;
const GRASS_FRAG = `
  varying vec2 vUv; varying float vHeight;
  uniform vec3 uColorBase; uniform vec3 uColorTip;
  void main() {
    vec3 color = mix(uColorBase,uColorTip,vHeight);
    float alpha = 1.0-smoothstep(0.85,1.0,vUv.x);
    gl_FragColor = vec4(color,alpha);
  }
`;
const GRASS_COUNT = 2000;
const FIELD_CENTER = new Vector3(18, 0, -5);
const FIELD_RADIUS = 60;

function GrassField({ weather }: { weather: WeatherState }) {
  const meshRef = useRef<InstancedMesh>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const timeRef = useRef(0);
  const { geometry, randomArr } = useMemo(() => {
    const geo = new BufferGeometry();
    const W = 0.06;
    geo.setAttribute('position', new BufferAttribute(new Float32Array([-W, 0, 0, W, 0, 0, 0, 1.0, 0]), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
    const rand = new Float32Array(GRASS_COUNT); const height = new Float32Array(GRASS_COUNT);
    for (let i = 0; i < GRASS_COUNT; i++) { rand[i] = Math.random(); height[i] = 0.4 + Math.random() * 0.8; }
    geo.setAttribute('aRandom', new BufferAttribute(rand, 1));
    geo.setAttribute('aHeight', new BufferAttribute(height, 1));
    return { geometry: geo, randomArr: { rand, height } };
  }, []);
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const mat4 = new Matrix4(), quat = new Quaternion(), scale = new Vector3(), pos = new Vector3();
    for (let i = 0; i < GRASS_COUNT; i++) {
      let x: number, z: number, dist: number;
      do {
        x = (Math.random() - 0.5) * FIELD_RADIUS * 2 + FIELD_CENTER.x;
        z = (Math.random() - 0.5) * FIELD_RADIUS * 2 + FIELD_CENTER.z;
        dist = Math.sqrt((x - FIELD_CENTER.x) ** 2 + (z - FIELD_CENTER.z) ** 2);
      } while (dist > FIELD_RADIUS || dist < 12);
      quat.setFromAxisAngle(new Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      scale.set(1, randomArr.height[i], 1); pos.set(x, 0, z);
      mat4.compose(pos, quat, scale); mesh.setMatrixAt(i, mat4);
    }
    mesh.instanceMatrix.usage = StaticDrawUsage; mesh.instanceMatrix.needsUpdate = true;
  }, []);
  const { colorBase, colorTip, windStrength } = useMemo(() => {
    const { isDay, condition } = weather;
    let base = new Color(0x3a7d44), tip = new Color(0x7ec850);
    if (!isDay) { base = new Color(0x1a3a22); tip = new Color(0x2d5c33); }
    else if (condition === 'rain' || condition === 'thunderstorm') { base = new Color(0x2d5c33); tip = new Color(0x4a8c50); }
    else if (condition === 'clouds') { base = new Color(0x3a6b3f); tip = new Color(0x6aaa50); }
    const wind = condition === 'thunderstorm' ? 0.35 : condition === 'rain' ? 0.25 : condition === 'clouds' ? 0.18 : 0.12;
    return { colorBase: base, colorTip: tip, windStrength: wind };
  }, [weather]);
  useFrame((_, delta) => { if (!matRef.current) return; timeRef.current += delta; matRef.current.uniforms.uTime.value = timeRef.current; });
  useEffect(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uWindStrength.value = windStrength;
    matRef.current.uniforms.uColorBase.value = colorBase;
    matRef.current.uniforms.uColorTip.value = colorTip;
  }, [windStrength, colorBase, colorTip]);
  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, GRASS_COUNT]} frustumCulled={false}>
      <shaderMaterial ref={matRef} vertexShader={GRASS_VERT} fragmentShader={GRASS_FRAG}
        uniforms={{ uTime: { value: 0 }, uWindStrength: { value: windStrength }, uColorBase: { value: colorBase }, uColorTip: { value: colorTip } }}
        side={DoubleSide} transparent />
    </instancedMesh>
  );
}

function Ground({ weather }: { weather: WeatherState }) {
  const groundColor = useMemo(() => {
    const { isDay, condition } = weather;
    if (!isDay) return '#1a2e1e';
    if (condition === 'rain' || condition === 'thunderstorm') return '#4a5c40';
    if (condition === 'clouds') return '#7a9460';
    return '#6aaa50';
  }, [weather]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[18, -0.05, -5]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={groundColor} roughness={0.95} metalness={0} />
      </mesh>
      <GrassField weather={weather} />
    </>
  );
}

// ── Weather lighting ─────────────────────────────────────
function WeatherLighting({ weather }: { weather: WeatherState }) {
  const { scene } = useThree();
  useEffect(() => {
    const { isDay, sunProgress, condition } = weather;
    let skyColor: Color;
    if (!isDay) skyColor = new Color(0x0a0f1e);
    else if (condition === 'rain' || condition === 'thunderstorm') skyColor = new Color(0x4a5568);
    else if (condition === 'clouds') skyColor = new Color(0x9eafc2);
    else if (condition === 'mist') skyColor = new Color(0xc8d4dc);
    else if (sunProgress < 0.15) skyColor = new Color(0xf97316).lerp(new Color(0x60a5fa), sunProgress / 0.15);
    else if (sunProgress > 0.85) skyColor = new Color(0x60a5fa).lerp(new Color(0xf97316), (sunProgress - 0.85) / 0.15);
    else skyColor = new Color(0x87ceeb);
    scene.background = skyColor;
  }, [weather, scene]);
  useEffect(() => () => { scene.background = null; }, [scene]);
  const { isDay, sunProgress, cloudiness, condition } = weather;
  const cloudDim = 1 - cloudiness * 0.5;
  const sunHeight = Math.sin((1 - Math.abs(sunProgress * 2 - 1)) * Math.PI * 0.5);
  const sunX = Math.sin((sunProgress - 0.5) * Math.PI) * 30;
  const sunColor = sunProgress < 0.15 || sunProgress > 0.85 ? 0xffaa44 : 0xffffff;
  const rainTint = (condition === 'rain' || condition === 'thunderstorm') ? 0.4 : 0;
  return (
    <>
      <ambientLight intensity={(isDay ? 1.2 : 0.15) * cloudDim} color={isDay ? 0xffffff : 0x334466} />
      {isDay && <directionalLight position={[sunX, Math.max(0.1, sunHeight * 20), -10]} intensity={Math.max(0, sunHeight) * (1 - cloudiness * 0.7) * 3.0} color={sunColor} castShadow />}
      {!isDay && <directionalLight position={[10, 15, -5]} intensity={0.3} color={0x8899cc} />}
      <directionalLight position={[-8, 4, -2]} intensity={isDay ? 0.8 * cloudDim : 0.1} color={isDay ? 0xffffff : 0x334466} />
      {rainTint > 0 && <ambientLight intensity={rainTint} color={0x6688aa} />}
    </>
  );
}

// ── 3D Farm model ────────────────────────────────────────
function FarmModel({
  led1On, led2On, led3On, showGreenhouse, onClick, onEquipButtonPositions,
}: {
  led1On: boolean; led2On: boolean; led3On: boolean;
  showGreenhouse: boolean; onClick: () => void;
  onEquipButtonPositions?: (btns: EquipButtonPos[]) => void;
}) {
  const gltf = useLoader(GLTFLoader, '/3d-model/pipeline.glb', setupLoader) as any;
  const leapGltf = useLoader(GLTFLoader, '/3d-model/leap.glb', setupLoader) as any;
  const cupGltf = useLoader(GLTFLoader, '/3d-model/cup.glb', setupLoader) as any;
  const { camera, size: canvasSize } = useThree();

  const { scene, ghNode } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    try {
      const anchors: any[] = [];
      cloned.traverse((o: any) => {
        if (o.name?.toLowerCase().includes('leap') && o.name?.toLowerCase().includes('anchor')) anchors.push(o);
      });
      for (const anchor of anchors) {
        const leap = leapGltf.scene.clone(true);
        leap.traverse((o: any) => {
          if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => { if (m) { m.side = DoubleSide; m.needsUpdate = true; } });
        });
        anchor.add(leap);
        const cup = cupGltf.scene.clone(true);
        cup.position.set(0, -0.08, 0); cup.scale.setScalar(1 / 3); anchor.add(cup);
      }
    } catch (_) { }
    applyMaterialDefaults(cloned); deduplicateMaterials(cloned);
    const sz = new Box3().setFromObject(cloned).getSize(new Vector3()).length();
    const cam = camera as PerspectiveCamera;
    cam.near = Math.max(0.001, sz * 0.001); cam.far = sz * 100; cam.updateProjectionMatrix();
    let foundGh: any = null;
    cloned.traverse((obj: any) => {
      if (obj.name && !foundGh && obj.name.toLowerCase().includes('greenhouse')) foundGh = obj;
    });
    return { scene: cloned, ghNode: foundGh };
  }, [gltf.scene, leapGltf.scene, cupGltf.scene, camera]);

  useEffect(() => () => {
    scene.traverse((obj: any) => {
      obj.geometry?.dispose();
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach?.((m: any) => m?.dispose?.());
    });
  }, [scene]);

  // LED light groups
  const spotGroupsRef = useRef<any[][]>([[], [], []]);
  useEffect(() => {
    const spots: any[] = [];
    scene.traverse((obj: any) => {
      if (!obj.isLight) return;
      if (obj._savedIntensity === undefined) obj._savedIntensity = obj.intensity / 1000;
      obj.intensity = obj._savedIntensity; spots.push(obj);
    });
    const sz = Math.ceil(spots.length / 3);
    spotGroupsRef.current = [spots.slice(sz * 2), spots.slice(sz, sz * 2), spots.slice(0, sz)];
  }, [scene]);

  const nodeMapRef = useRef<Map<string, any[]>>(new Map());
  useEffect(() => {
    const setVis = (keyword: string, visible: boolean) => {
      const key = keyword.toLowerCase();
      if (!nodeMapRef.current.has(key)) {
        const found: any[] = [];
        scene.traverse((o: any) => { if (o.name?.toLowerCase().includes(key)) found.push(o); });
        nodeMapRef.current.set(key, found);
      }
      nodeMapRef.current.get(key)!.forEach((o: any) => { o.traverse((c: any) => { c.visible = visible; }); o.visible = visible; });
    };
    [led1On, led2On, led3On].forEach((on, i) => {
      spotGroupsRef.current[i]?.forEach((l: any) => { l.intensity = on ? (l._savedIntensity ?? l.intensity) : 0; });
    });
    setVis('light1-off', !led1On); setVis('light1-on', led1On);
    setVis('light2-off', !led2On); setVis('light2-on', led2On);
    setVis('light3-off', !led3On); setVis('light3-on', led3On);
  }, [led1On, led2On, led3On, scene]);

  // Greenhouse visibility
  useEffect(() => {
    if (!ghNode) return;
    ghNode.traverse((c: any) => { c.visible = showGreenhouse; });
    ghNode.visible = showGreenhouse;
  }, [showGreenhouse, ghNode]);

  // Equipment anchor nodes
  const equipAnchorNodesRef = useRef<{ key: string; node: any }[]>([]);
  useEffect(() => {
    const found: { key: string; node: any }[] = [];
    scene.traverse((o: any) => {
      if (!o.name) return;
      const match = EQUIP_BUTTON_DEFS.find(d => o.name.toLowerCase() === d.key.toLowerCase());
      if (match) found.push({ key: match.key, node: o });
    });
    equipAnchorNodesRef.current = found;
  }, [scene]);

  // Per-frame: project anchor → screen coords
  useFrame(() => {
    if (!onEquipButtonPositions || equipAnchorNodesRef.current.length === 0) return;
    const result: EquipButtonPos[] = []; const worldPos = new Vector3();
    for (const { key, node } of equipAnchorNodesRef.current) {
      node.getWorldPosition(worldPos);
      const projected = worldPos.clone().project(camera);
      if (projected.z > 1) continue;
      const x = (projected.x * 0.5 + 0.5) * canvasSize.width;
      const y = (-projected.y * 0.5 + 0.5) * canvasSize.height;
      const def = EQUIP_BUTTON_DEFS.find(d => d.key === key);
      if (def) result.push({
        key, label: def.label, icon: def.icon,
        equipmentIds: [...def.equipmentIds] as number[],
        ledId: ('ledId' in def) ? (def as any).ledId : undefined,
        x, y,
      });
    }
    onEquipButtonPositions(result);
  });

  const isInGreenhouse = (obj: any): boolean => {
    if (!ghNode) return false;
    let cur = obj;
    while (cur) { if (cur === ghNode) return true; cur = cur.parent; }
    return false;
  };

  return (
    <primitive object={scene}
      onClick={(e: any) => {
        if (!showGreenhouse) return;
        if (isInGreenhouse(e.object)) { e.stopPropagation(); onClick(); }
      }}
    />
  );
}

// ── Precipitation overlay (rain / snow) ──────────────────
function PrecipitationOverlay({ condition }: { condition: string }) {
  const isRain = condition === 'rain' || condition === 'thunderstorm';
  const isSnow = condition === 'snow';
  const items = useMemo(() =>
    Array.from({ length: isRain ? 55 : isSnow ? 38 : 0 }, (_, i) => ({
      id: i,
      left: Math.random() * 108 - 4,
      delay: Math.random() * 2,
      duration: isRain ? 0.45 + Math.random() * 0.35 : 3.5 + Math.random() * 3,
      h: isRain ? 12 + Math.random() * 15 : 0,
      sz: isSnow ? 2 + Math.random() * 4 : 0,
      opacity: isRain ? 0.28 + Math.random() * 0.32 : 0.55 + Math.random() * 0.35,
    })),
    [condition]);
  if (!isRain && !isSnow) return null;
  return (
    <div className="farm3dm__precip">
      {items.map(item => (
        <span key={item.id}
          className={isSnow ? 'farm3dm__precip-flake' : 'farm3dm__precip-drop'}
          style={{
            left: `${item.left}%`,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.duration}s`,
            opacity: item.opacity,
            ...(isRain ? { height: `${item.h}px` } : { width: `${item.sz}px`, height: `${item.sz}px` }),
          }}
        />
      ))}
    </div>
  );
}

// ── Top-bar UI components ────────────────────────────────
const WEATHER_ICONS: Record<string, string> = { clear: '☀️', clouds: '⛅', rain: '🌧️', snow: '❄️', thunderstorm: '⛈️', mist: '🌫️' };
const WEATHER_LABELS: Record<string, string> = { clear: '맑음', clouds: '흐림', rain: '비', snow: '눈', thunderstorm: '폭풍', mist: '안개' };

function WeatherWidget({ weather }: { weather: WeatherState }) {
  if (weather.loading) return null;
  return (
    <div className="farm3dm__weather">
      <span className="farm3dm__weather-icon">{WEATHER_ICONS[weather.condition] ?? '🌤️'}</span>
      <span className="farm3dm__weather-temp">{weather.temperature.toFixed(1)}°</span>
      <span className="farm3dm__weather-label">{WEATHER_LABELS[weather.condition] ?? weather.condition}</span>
    </div>
  );
}

function DayProgress({ weather, time }: { weather: WeatherState; time: Date }) {
  if (weather.loading) return null;
  const { isDay, sunProgress } = weather;
  const timeStr = time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const pct = Math.max(2, Math.min(97, sunProgress * 100));
  return (
    <div className="farm3dm__dayprogress">
      <span className="farm3dm__dayprogress-time">{timeStr}</span>
      <div className="farm3dm__dayprogress-track">
        <div className="farm3dm__dayprogress-fill" style={{ width: `${pct}%` }} />
        <span className="farm3dm__dayprogress-sun" style={{ left: `${pct}%` }}>{isDay ? '☀️' : '🌙'}</span>
      </div>
    </div>
  );
}

function SensorBar({ data, isDark }: { data: EnvironmentData; isDark: boolean }) {
  const c = isDark
    ? { temp: '#f87171', hum: '#60a5fa', co2: '#c084fc', ec: '#fbbf24' }
    : { temp: '#dc2626', hum: '#0369a1', co2: '#6d28d9', ec: '#92400e' };
  return (
    <div className="farm3dm__sensors">
      <div className="farm3dm__sensor-item"><span>🌡️</span><span className="farm3dm__sensor-val" style={{ color: c.temp }}>{data.temperature.toFixed(1)}°C</span></div>
      <div className="farm3dm__sensor-item"><span>💧</span><span className="farm3dm__sensor-val" style={{ color: c.hum }}>{data.humidity.toFixed(1)}%</span></div>
      <div className="farm3dm__sensor-item"><span>💨</span><span className="farm3dm__sensor-val" style={{ color: c.co2 }}>{data.co2.toFixed(0)}ppm</span></div>
      <div className="farm3dm__sensor-item"><span>⚡</span><span className="farm3dm__sensor-val" style={{ color: c.ec }}>{data.ec.toFixed(1)}dS/m</span></div>
    </div>
  );
}

// ── Canvas overlay panels ────────────────────────────────
function GreenhouseSpecPanel() {
  return (
    <div className="farm3dm__left-panel">
      <div className="farm3dm__panel-title">🏭 온실 스펙</div>
      <div className="farm3dm__panel-divider" />
      <div className="farm3dm__panel-section">재배</div>
      <div className="farm3dm__panel-row"><span>면적</span><span>2.5평</span></div>
      <div className="farm3dm__panel-row farm3dm__panel-row--hl"><span>모종</span><span>324주</span></div>
      <div className="farm3dm__panel-divider" />
      <div className="farm3dm__panel-section">히트펌프</div>
      <div className="farm3dm__panel-row"><span>용량</span><span>1 PS</span></div>
      <div className="farm3dm__panel-row"><span>수온</span><span>7~25°C</span></div>
      <div className="farm3dm__panel-chips">
        <div className="farm3dm__panel-chip farm3dm__panel-chip--hot">
          <span>난방</span><span>2,600 kcal</span><span>1.2 kW</span>
        </div>
        <div className="farm3dm__panel-chip farm3dm__panel-chip--cold">
          <span>냉방</span><span>2,400 kcal</span><span>1.3 kW</span>
        </div>
      </div>
    </div>
  );
}

function FarmStatusPanel({ data }: { data: EnvironmentData }) {
  const { equipmentGroups } = useFarm();
  const [activeTab, setActiveTab] = useState<'env' | 'log'>('env');

  const envItems = useMemo(() => [
    { key: 'temp',   icon: '🌡️', label: '온도',      value: `${data.temperature.toFixed(1)}°C`,      color: '#e11d48' },
    { key: 'hum',    icon: '💧', label: '습도',      value: `${data.humidity.toFixed(1)}%`,          color: '#0284c7' },
    { key: 'co2',    icon: '💨', label: 'CO₂',       value: `${data.co2.toFixed(0)} ppm`,            color: '#7c3aed' },
    { key: 'light1', icon: '☀️', label: 'LED 1',      value: `${(data.light1 ?? 0).toFixed(0)} lux`, color: '#d97706' },
    { key: 'light2', icon: '☀️', label: 'LED 2',      value: `${(data.light2 ?? 0).toFixed(0)} lux`, color: '#ea580c' },
    { key: 'light3', icon: '☀️', label: 'LED 3',      value: `${(data.light3 ?? 0).toFixed(0)} lux`, color: '#db2777' },
    { key: 'ph',     icon: '🧪', label: 'pH',        value: data.ph.toFixed(1),                      color: '#059669' },
    { key: 'ec',     icon: '⚡', label: 'EC',        value: `${data.ec.toFixed(1)} dS/m`,            color: '#b45309' },
    { key: 'wt',     icon: '🌊', label: '수온',      value: `${data.waterTemp.toFixed(1)}°C`,        color: '#0891b2' },
    { key: 'o2',     icon: '🫧', label: '용존O₂',   value: `${data.oxygenLevel.toFixed(1)} mg/L`,   color: '#16a34a' },
  ], [data.temperature, data.humidity, data.co2, data.light1, data.light2, data.light3, data.ph, data.ec, data.waterTemp, data.oxygenLevel]);

  const equipSummary = useMemo(() => equipmentGroups.map(grp => {
    const on = grp.equipment.filter(e => e.status !== 'OFF').length;
    return { icon: grp.icon, name: grp.displayName, on, total: grp.equipment.length, color: grp.color };
  }), [equipmentGroups]);

  return (
    <div className="farm3dm__left-panel farm3dm__left-panel--scroll farm3dm__left-panel--zoomed">
      {/* 탭 헤더 */}
      <div className="farm3dm__panel-tabs">
        <button
          className={`farm3dm__panel-tab${activeTab === 'env' ? ' farm3dm__panel-tab--active' : ''}`}
          onClick={() => setActiveTab('env')}
        >📊 환경</button>
        <button
          className={`farm3dm__panel-tab${activeTab === 'log' ? ' farm3dm__panel-tab--active' : ''}`}
          onClick={() => setActiveTab('log')}
        >📋 로그</button>
      </div>

      {/* 탭 콘텐츠 — 이 div만 스크롤됨 */}
      <div className="farm3dm__panel-scroll-body">
        {activeTab === 'env' && (
          <>
            <div className="farm3dm__status-env-grid">
              {envItems.map(it => (
                <div key={it.key} className="farm3dm__status-env-cell">
                  <span>{it.icon}</span>
                  <span className="farm3dm__status-env-label">{it.label}</span>
                  <span className="farm3dm__status-env-val" style={{ color: it.color }}>{it.value}</span>
                </div>
              ))}
            </div>
            <div className="farm3dm__panel-divider" />
            <div className="farm3dm__panel-title">⚙️ 설비 현황</div>
            {equipSummary.map(eq => (
              <div key={eq.name} className="farm3dm__status-equip-row">
                <span className="farm3dm__status-equip-name">{eq.name}</span>
                <span className="farm3dm__status-equip-count" style={{ color: eq.on > 0 ? eq.color : '#6b7280' }}>{eq.on}/{eq.total}</span>
                <div className="farm3dm__status-equip-bar">
                  <div className="farm3dm__status-equip-bar-fill" style={{ width: `${(eq.on / eq.total) * 100}%`, background: eq.color }} />
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'log' && (
          <div className="farm3dm__log-tab-content">
            <ActivityTimeline />
          </div>
        )}
      </div>

    </div>
  );
}

const MOCK_PLANT = {
  analyzedAt: '2026-05-11 06:00',
  summary: '파이프 내 식물 없음 — 정식 준비 단계',
  status: 'empty' as 'healthy' | 'warning' | 'empty',
  details: [
    { icon: '🪴', label: '정식 여부', value: '미정식 (Net pot 슬롯 비어있음)' },
    { icon: '🌱', label: '육묘 상태', value: '하단 플러그 트레이 발아 진행 중' },
    { icon: '💧', label: '배관 상태', value: '정상 — 양액 공급 이상 없음' },
    { icon: '📡', label: '센서 모듈', value: '각 열 부착 센서 정상 감지' },
    { icon: '📅', label: '정식 예상', value: '약 7~10일 내 가능' },
  ],
  recommendation: '현재 파이프에 식물이 없습니다. 육묘 트레이 발아 후 정식 일정을 수립하세요.',
};

function PlantStatusPanel() {
  const { status, summary, analyzedAt, details, recommendation } = MOCK_PLANT;
  const statusColor = status === 'healthy' ? '#34d399' : status === 'warning' ? '#fbbf24' : '#94a3b8';
  const statusLabel = status === 'healthy' ? '정상' : status === 'warning' ? '주의' : '비어있음';
  return (
    <div className="farm3dm__plant-panel">
      <div className="farm3dm__plant-header">
        <div className="farm3dm__plant-title">🌿 AI 식물 상태 분석</div>
        <div className="farm3dm__plant-time">분석: {analyzedAt}</div>
      </div>
      <div className="farm3dm__plant-badge" style={{ borderColor: statusColor, color: statusColor }}>
        <span className="farm3dm__plant-dot" style={{ background: statusColor }} />
        {statusLabel}
      </div>
      <div className="farm3dm__plant-summary">{summary}</div>
      <div className="farm3dm__plant-details">
        {details.map((d, i) => (
          <div key={i} className="farm3dm__plant-detail-row">
            <span>{d.icon}</span>
            <div><span className="farm3dm__plant-detail-label">{d.label}</span><span className="farm3dm__plant-detail-val">{d.value}</span></div>
          </div>
        ))}
      </div>
      <div className="farm3dm__plant-rec"><span>💡</span>{recommendation}</div>
    </div>
  );
}

const FUNNEL_BASE = 'https://k8s-worker02.tail63c20e.ts.net';
const CAMERAS = [{ id: 'cam2', label: 'CAM 1' }, { id: 'cam1', label: 'CAM 2' }];

function CctvMiniPanel({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="farm3dm__cctv-mini">
      <button className="farm3dm__cctv-expand-btn" onClick={onExpand}>📹 전체보기</button>
      {CAMERAS.map(cam => (
        <div key={cam.id} className="farm3dm__cctv-mini-cam">
          <div className="farm3dm__cctv-mini-header">
            <span className="farm3dm__cctv-live-dot" />
            <span className="farm3dm__cctv-mini-label">{cam.label}</span>
          </div>
          <iframe src={`${FUNNEL_BASE}/${cam.id}`} className="farm3dm__cctv-mini-frame" allow="autoplay" />
        </div>
      ))}
    </div>
  );
}

function CctvFull({ onClose }: { onClose: () => void }) {
  return (
    <div className="farm3dm__cctv-full">
      <div className="farm3dm__cctv-full-feeds">
        {CAMERAS.map(cam => (
          <div key={cam.id} className="farm3dm__cctv-full-cam">
            <div className="farm3dm__cctv-mini-header">
              <span className="farm3dm__cctv-live-dot" />
              <span className="farm3dm__cctv-mini-label">{cam.label}</span>
            </div>
            <iframe src={`${FUNNEL_BASE}/${cam.id}`} className="farm3dm__cctv-full-frame" allow="autoplay" allowFullScreen />
          </div>
        ))}
      </div>
      <button className="farm3dm__cctv-close" onClick={onClose}>✕ 닫기</button>
    </div>
  );
}

// ── Floating equipment buttons (pipeline view) ──────────
type EquipCtrl = { key: string; label: string; icon: string; equipmentIds: readonly number[]; ledId?: number };
const ALL_EQUIP_DEFS = [
  ...EQUIP_BUTTON_DEFS.filter(d => 'ledId' in d),
  ...EQUIP_BUTTON_DEFS.filter(d => !('ledId' in d)),
] as unknown as EquipCtrl[];

interface EquipFloatPanelProps {
  getIsOn: (d: EquipCtrl) => boolean;
  getIsMaintenance: (d: EquipCtrl) => boolean;
  onToggle: (d: EquipCtrl) => void;
}
function EquipFloatPanel({ getIsOn, getIsMaintenance, onToggle }: EquipFloatPanelProps) {
  return (
    <div className="farm3dm__equip-float">
      {ALL_EQUIP_DEFS.map(def => {
        const isOn = getIsOn(def);
        const isMaint = getIsMaintenance(def);
        const color = EQUIP_COLORS[def.key] ?? '#94a3b8';
        return (
          <button key={def.key}
            className={`farm3dm__equip-float-btn${isOn && !isMaint ? ' farm3dm__equip-float-btn--on' : ''}${isMaint ? ' farm3dm__equip-float-btn--maintenance' : ''}`}
            style={isOn && !isMaint ? { borderColor: color, background: `${color}22` } : { borderColor: `${color}44` }}
            onClick={() => !isMaint && onToggle(def)}
            disabled={isMaint}
          >
            <span className="farm3dm__equip-float-dot" style={{ background: isMaint ? '#9ca3af' : color, boxShadow: isMaint ? 'none' : `0 0 6px ${color}` }} />
            <span className="farm3dm__equip-float-label">{isMaint ? '🔧' : def.icon} {def.label}</span>
            <span className="farm3dm__equip-float-status" style={isOn && !isMaint ? { color } : {}}>{isMaint ? '수리중' : isOn ? 'ON' : 'OFF'}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Bottom navigation ────────────────────────────────────
function IconGrid() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1.2" /><rect x="9.5" y="1.5" width="5" height="5" rx="1.2" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1.2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1.2" />
    </svg>
  );
}
function IconTrend() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,12 4.5,7.5 8,10 12,4.5 15,6.5" />
      <line x1="1" y1="14.5" x2="15" y2="14.5" />
    </svg>
  );
}
function IconShop() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6h11l-1.5 7.5H4L2.5 6z" />
      <path d="M5.5 6V4.5a2.5 2.5 0 015 0V6" />
    </svg>
  );
}
function IconSliders() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="5" x2="15" y2="5" />
      <line x1="1" y1="11" x2="15" y2="11" />
      <circle cx="5" cy="5" r="2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="11" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

type NavId = 'dashboard' | 'analytics' | 'market' | 'settings';
type AppMode = 'high' | 'lite';

const NAV_ITEMS: { id: NavId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: '대시보드', icon: <IconGrid /> },
  { id: 'analytics', label: 'AI', icon: <IconTrend /> },
  { id: 'market', label: '마켓', icon: <IconShop /> },
  { id: 'settings', label: '설정', icon: <IconSliders /> },
];

function BottomNav({ active, onSelect }: { active: NavId; onSelect: (id: NavId) => void }) {
  return (
    <div className="farm3dm__bottombar">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`farm3dm__nav-item${item.id === active ? ' farm3dm__nav-item--active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          {item.icon}
          <span className="farm3dm__nav-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Native ready signal (GLTF loaded → hide loading screen) ─
function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, []);
  return null;
}

// ── Drag-to-close hook (bottom sheet) ────────────────────
function useDragToClose(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const dy = Math.max(0, e.touches[0].clientY - startY.current);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - startY.current;
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (dy > 80) {
      sheet.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';
      sheet.style.transform = 'translateY(100%)';
      setTimeout(onClose, 220);
    } else if (Math.abs(dy) < 8) {
      onClose();
    } else {
      sheet.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
      sheet.style.transform = 'translateY(0)';
    }
  };
  return { sheetRef, handleProps: { onTouchStart, onTouchMove, onTouchEnd } };
}

// ── AI chat overlay ───────────────────────────────────────
function AiOverlay({ onClose }: { onClose: () => void }) {
  const { sheetRef, handleProps } = useDragToClose(onClose);
  return (
    <>
      <div className="farm3dm__ai-backdrop" onClick={onClose} />
      <div className="farm3dm__ai-sheet" ref={sheetRef}>
        <div className="farm3dm__ai-handle-area" {...handleProps}>
          <div className="farm3dm__settings-handle" />
        </div>
        <Chatbot embedded noAutoFocus />
      </div>
    </>
  );
}

// ── Market overlay (placeholder) ─────────────────────────
function MarketOverlay({ onClose }: { onClose: () => void }) {
  const { sheetRef, handleProps } = useDragToClose(onClose);
  const actions = [
    { label: '퀵 등록', desc: '수확물 판매 등록' },
    { label: '내 판매 현황', desc: '등록 품목 조회' },
    { label: '시세 확인', desc: '오늘의 농산물 시세' },
  ];
  return (
    <>
      <div className="farm3dm__mkt-backdrop" onClick={onClose} />
      <div className="farm3dm__mkt-sheet" ref={sheetRef}>
        <div className="farm3dm__mkt-handle-area" {...handleProps}>
          <div className="farm3dm__settings-handle" />
        </div>
        <div className="farm3dm__mkt-header">
          <span className="farm3dm__mkt-title">마켓</span>
          <button className="farm3dm__settings-close" onClick={onClose}>✕</button>
        </div>
        <div className="farm3dm__mkt-coming">서비스 준비 중</div>
        <div className="farm3dm__mkt-actions">
          {actions.map(a => (
            <button key={a.label} className="farm3dm__mkt-action-row" disabled>
              <div>
                <span className="farm3dm__mkt-action-label">{a.label}</span>
                <span className="farm3dm__mkt-action-desc">{a.desc}</span>
              </div>
              <span className="farm3dm__mkt-action-arrow">→</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Settings overlay ──────────────────────────────────────
function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const { sheetRef, handleProps } = useDragToClose(onClose);
  const [mode, setMode] = useState<AppMode>(
    () => (localStorage.getItem('coglabs-mode') as AppMode) ?? 'high'
  );

  const handleSelect = (m: AppMode) => {
    setMode(m);
    localStorage.setItem('coglabs-mode', m);
    (window as any).ReactNativeWebView?.postMessage(
      JSON.stringify({ type: 'modeChange', mode: m })
    );
    onClose();
  };

  return (
    <>
      <div className="farm3dm__settings-backdrop" onClick={onClose} />
      <div className="farm3dm__settings-sheet" ref={sheetRef}>
        <div className="farm3dm__settings-handle-area" {...handleProps}>
          <div className="farm3dm__settings-handle" />
        </div>
        <div className="farm3dm__settings-header">
          <span className="farm3dm__settings-title">설정</span>
          <button className="farm3dm__settings-close" onClick={onClose}>✕</button>
        </div>
        <div className="farm3dm__settings-section-label">Performance Mode</div>
        <div className="farm3dm__mode-selector">
          <button
            className={`farm3dm__mode-btn${mode === 'high' ? ' farm3dm__mode-btn--active' : ''}`}
            onClick={() => handleSelect('high')}
          >
            {mode === 'high' && <span className="farm3dm__mode-dot" />}
            <span className="farm3dm__mode-title">High Spec</span>
            <span className="farm3dm__mode-desc">3D 대시보드 · 가로화면</span>
          </button>
          <button
            className={`farm3dm__mode-btn${mode === 'lite' ? ' farm3dm__mode-btn--active' : ''}`}
            onClick={() => handleSelect('lite')}
          >
            {mode === 'lite' && <span className="farm3dm__mode-dot" />}
            <span className="farm3dm__mode-title">Lite</span>
            <span className="farm3dm__mode-desc">데이터 전용 · 세로화면</span>
          </button>
        </div>
      </div>
    </>
  );
}

const DEFAULT_SENSOR: EnvironmentData = {
  temperature: 0, humidity: 0, co2: 0, ph: 0, ec: 0, waterTemp: 0, oxygenLevel: 0,
};

// ── Main component ───────────────────────────────────────
export interface FarmModel3DMobileProps {
  led1On?: boolean; led2On?: boolean; led3On?: boolean;
  sensorData?: EnvironmentData;
}

export default function FarmModel3DMobile({
  led1On = false, led2On = false, led3On = false, sensorData = DEFAULT_SENSOR,
}: FarmModel3DMobileProps) {
  const animRef = useRef<AnimTarget>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const farm2TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<number>(0);
  // TODO: 캡처용 황혼 고정 — 확인 후 제거
  // TODO: 캡처용 황혼 고정 — 확인 후 제거
  const weather = useWeather();
  const skyInfo = useMemo(() => computeSkyInfo(weather), [weather]);
  const { toggleEquipmentStatus, equipmentGroups } = useFarm();

  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [canvasKey, setCanvasKey] = useState(0);
  const [selectedFarm, setSelectedFarm] = useState<'farm1' | 'farm2'>('farm1');
  const [showGreenhouse, setShowGreenhouse] = useState(true);
  const [showFarm1, setShowFarm1] = useState(true);
  const [isZoomedInFarm1, setIsZoomedInFarm1] = useState(false);
  const [isPlantCheckView, setIsPlantCheckView] = useState(false);
  const [showCctv, setShowCctv] = useState(false);
  const [farm2Disabled, setFarm2Disabled] = useState(false);
  const [equipBtnPositions, setEquipBtnPositions] = useState<EquipButtonPos[]>([]);
  const [localLed1, setLocalLed1] = useState(led1On);
  const [localLed2, setLocalLed2] = useState(led2On);
  const [localLed3, setLocalLed3] = useState(led3On);
  const [showSettings, setShowSettings] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showMarket, setShowMarket] = useState(false);

  useEffect(() => {
    const handleNativeBack = () => {
      const rn = (window as any).ReactNativeWebView;
      if (!rn) return;
      if (showSettings || showAi || showMarket) {
        setShowSettings(false);
        setShowAi(false);
        setShowMarket(false);
        rn.postMessage(JSON.stringify({ type: 'backResult', hadOverlay: true }));
      } else {
        rn.postMessage(JSON.stringify({ type: 'backResult', hadOverlay: false }));
      }
    };
    window.addEventListener('nativeBack', handleNativeBack);
    return () => window.removeEventListener('nativeBack', handleNativeBack);
  }, [showSettings, showAi, showMarket]);

  const readyFiredRef = useRef(false);
  const handleReady = useCallback(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
  }, []);

  // props → local LED sync (overview 상태에서만)
  useEffect(() => {
    if (!isZoomedInFarm1) { setLocalLed1(led1On); setLocalLed2(led2On); setLocalLed3(led3On); }
  }, [led1On, led2On, led3On, isZoomedInFarm1]);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => () => { if (farm2TimerRef.current) clearTimeout(farm2TimerRef.current); }, []);

  // 팜1 진입
  const handleFarm1Click = () => {
    setShowGreenhouse(false);
    setIsZoomedInFarm1(true);
    animRef.current = { toPos: PIPELINE1_POS.clone(), toTarget: PIPELINE1_TARGET.clone() };
  };

  // 뒤로가기
  const handleBackClick = () => {
    if (isPlantCheckView) {
      setIsPlantCheckView(false);
      animRef.current = { toPos: PIPELINE1_POS.clone(), toTarget: PIPELINE1_TARGET.clone() };
      return;
    }
    setShowGreenhouse(true);
    setIsZoomedInFarm1(false);
    animRef.current = { toPos: OVERVIEW_POS.clone(), toTarget: OVERVIEW_TARGET.clone() };
  };

  // 팜2 클릭 (비활성)
  const handleFarm2Click = () => {
    setFarm2Disabled(true);
    if (farm2TimerRef.current) clearTimeout(farm2TimerRef.current);
    farm2TimerRef.current = setTimeout(() => setFarm2Disabled(false), 3000);
  };

  // 팜 전환
  const handleFarmSwitch = (farm: 'farm1' | 'farm2') => {
    if (farm === selectedFarm) return;
    setSelectedFarm(farm);
    setCanvasKey(k => k + 1);
    setIsZoomedInFarm1(false);
    setIsPlantCheckView(false);
    setShowGreenhouse(true);
    setShowFarm1(farm === 'farm1');
    animRef.current = null;
  };

  // 장비 버튼 ON/OFF
  const getIsOn = (btn: EquipCtrl): boolean => {
    if (btn.ledId != null) {
      return btn.ledId === 1 ? localLed1 : btn.ledId === 2 ? localLed2 : localLed3;
    }
    const allEquip = equipmentGroups.flatMap(g => g.equipment);
    return btn.equipmentIds.some(id => {
      const eq = allEquip.find(e => e.id === id);
      return eq && eq.status !== 'OFF';
    });
  };

  const getIsMaintenance = (btn: EquipCtrl): boolean => {
    if (btn.ledId != null) {
      const allEquip = equipmentGroups.flatMap(g => g.equipment);
      return allEquip.find(e => e.id === btn.ledId)?.status === 'MAINTENANCE';
    }
    return false;
  };

  const handleEquipClick = (btn: EquipCtrl) => {
    if (getIsMaintenance(btn)) return;
    const next = !getIsOn(btn);
    if (btn.ledId != null) {
      const setFn = btn.ledId === 1 ? setLocalLed1 : btn.ledId === 2 ? setLocalLed2 : setLocalLed3;
      setFn(next);
      toggleEquipmentStatus(btn.ledId, next ? 'ON' : 'OFF');
      equipmentApi.control(btn.ledId, next ? 'ON' : 'OFF').catch(console.error);
    } else {
      btn.equipmentIds.forEach(id => {
        toggleEquipmentStatus(id, next ? 'ON' : 'OFF');
        equipmentApi.control(id, next ? 'ON' : 'OFF').catch(console.error);
      });
    }
  };

  const activeLed1 = isZoomedInFarm1 ? localLed1 : led1On;
  const activeLed2 = isZoomedInFarm1 ? localLed2 : led2On;
  const activeLed3 = isZoomedInFarm1 ? localLed3 : led3On;

  const handleCanvasDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (isPlantCheckView) {
        animRef.current = { toPos: PLANT_CHECK_POS.clone(), toTarget: PLANT_CHECK_TARGET.clone() };
      } else if (isZoomedInFarm1) {
        animRef.current = { toPos: PIPELINE1_POS.clone(), toTarget: PIPELINE1_TARGET.clone() };
      } else {
        animRef.current = { toPos: OVERVIEW_POS.clone(), toTarget: OVERVIEW_TARGET.clone() };
      }
    }
    lastTapRef.current = now;
  };

  return (
    <div
      className={`farm3dm__root${skyInfo.isDark ? ' farm3dm__root--dark' : ''}`}
      style={{
        '--sky-bg': skyInfo.bg,
        '--sky-text': skyInfo.isDark ? '#ffffff' : '#0f172a',
        '--sky-text-muted': skyInfo.isDark ? 'rgba(255,255,255,0.6)' : '#475569',
        '--sky-text-dim': skyInfo.isDark ? 'rgba(255,255,255,0.28)' : '#94a3b8',
        '--sky-border': skyInfo.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)',
      } as React.CSSProperties}
    >
      {/* 상단 바: 날씨 / 진행 / 센서 */}
      <div className="farm3dm__topbar">
        <WeatherWidget weather={weather} />
        <DayProgress weather={weather} time={currentTime} />
        <SensorBar data={sensorData} isDark={skyInfo.isDark} />
      </div>

      {/* CCTV 전체보기 */}
      {showCctv ? (
        <CctvFull onClose={() => setShowCctv(false)} />
      ) : (
        <div ref={wrapRef} className="farm3dm__canvas-wrap" onTouchEnd={handleCanvasDoubleTap}>
          {size.w > 0 && size.h > 0 && (
            <Canvas key={canvasKey}
              camera={{ position: [OVERVIEW_POS.x, OVERVIEW_POS.y, OVERVIEW_POS.z], fov: 45, near: 0.001, far: 10000 }}
              style={{ width: size.w, height: size.h, display: 'block' }}
              dpr={Math.min(window.devicePixelRatio, 1.2)}
              gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.3, powerPreference: 'high-performance' }}
              resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
            >
              <WeatherLighting weather={weather} />
              <Ground weather={weather} />
              <Suspense fallback={null}>
                {showFarm1 && (
                  <>
                    <FarmModel
                      led1On={activeLed1} led2On={activeLed2} led3On={activeLed3}
                      showGreenhouse={showGreenhouse}
                      onClick={handleFarm1Click}
                      onEquipButtonPositions={isZoomedInFarm1 && !isPlantCheckView ? setEquipBtnPositions : undefined}
                    />
                    <ReadySignal onReady={handleReady} />
                  </>
                )}
              </Suspense>
              <MobileCameraControls animRef={animRef} />
            </Canvas>
          )}


          {/* ── 강수 파티클 ── */}
          {!isZoomedInFarm1 && <PrecipitationOverlay condition={weather.condition} />}

          {/* ── 팜 이름 라벨 ── */}
          <div className="farm3dm__farmlabel">
            <span className="farm3dm__farmlabel-badge">{selectedFarm === 'farm1' ? 'FARM 1' : 'FARM 2'}</span>
            <span className="farm3dm__farmlabel-text">{selectedFarm === 'farm1' ? 'CogLabs 스마트팜 1호' : 'CogLabs 스마트팜 2호'}</span>
          </div>

          {/* ── 팜 탭 전환 (좌상단) ── */}
          {!isZoomedInFarm1 && (
            <div className="farm3dm__farmtabs">
              <button className={`farm3dm__farmtab${selectedFarm === 'farm1' ? ' farm3dm__farmtab--active' : ''}`} onClick={() => handleFarmSwitch('farm1')}>팜 1</button>
              <button className={`farm3dm__farmtab${selectedFarm === 'farm2' ? ' farm3dm__farmtab--active' : ''}`} onClick={() => selectedFarm === 'farm2' ? handleFarm2Click() : handleFarmSwitch('farm2')}>팜 2</button>
            </div>
          )}

          {/* ── Overview: 온실 스펙 패널 (좌측) ── */}
          {!isZoomedInFarm1 && selectedFarm === 'farm1' && <GreenhouseSpecPanel />}

          {/* ── Overview: CCTV 미니 패널 (우측 하단) ── */}
          {!isZoomedInFarm1 && selectedFarm === 'farm1' && <CctvMiniPanel onExpand={() => setShowCctv(true)} />}

          {/* ── Overview: 팜1 진입 버튼 ── */}
          {!isZoomedInFarm1 && selectedFarm === 'farm1' && (
            <button className="farm3dm__enter-btn" onClick={handleFarm1Click}>
              🏭 <span>팜 1 진입</span> →
            </button>
          )}

          {/* ── 뒤로가기 버튼 ── */}
          {isZoomedInFarm1 && (
            <button className="farm3dm__back-btn" onClick={handleBackClick}>← 전체보기</button>
          )}

          {/* ── Zoomed: 환경·설비 패널 (좌측) ── */}
          {isZoomedInFarm1 && !isPlantCheckView && <FarmStatusPanel data={sensorData} />}

          {/* ── Zoomed: 식물 상태 버튼 (모델·제어버튼 사이) ── */}
          {isZoomedInFarm1 && !isPlantCheckView && (
            <button className="farm3dm__plant-check-btn" onClick={() => {
              setIsPlantCheckView(true);
              animRef.current = { toPos: PLANT_CHECK_POS.clone(), toTarget: PLANT_CHECK_TARGET.clone() };
            }}>🌿 식물 상태</button>
          )}

          {/* ── Zoomed: 장비 3D 앵커 dot markers ── */}
          {isZoomedInFarm1 && !isPlantCheckView && equipBtnPositions.map(btn => (
            <div key={btn.key} className="farm3dm__equip-anchor-dot"
              style={{
                left: btn.x, top: btn.y,
                background: EQUIP_COLORS[btn.key] ?? '#94a3b8',
                boxShadow: `0 0 8px ${EQUIP_COLORS[btn.key] ?? '#94a3b8'}`,
              }}
            />
          ))}

          {/* ── Zoomed: 플로팅 장비 제어 버튼 ── */}
          {isZoomedInFarm1 && !isPlantCheckView && (
            <EquipFloatPanel getIsOn={getIsOn} getIsMaintenance={getIsMaintenance} onToggle={handleEquipClick} />
          )}


          {/* ── 식물 상태 패널 ── */}
          {isPlantCheckView && <PlantStatusPanel />}

          {/* ── 팜2: 준비중 오버레이 ── */}
          {selectedFarm === 'farm2' && (
            <div className="farm3dm__coming-soon">
              <div className="farm3dm__coming-soon-icon">🌱</div>
              <div className="farm3dm__coming-soon-title">오픈 준비중</div>
              <div className="farm3dm__coming-soon-sub">Farm 2는 곧 만나보실 수 있습니다</div>
            </div>
          )}

          {/* ── 팜2 비활성 토스트 ── */}
          {farm2Disabled && (
            <div className="farm3dm__toast">
              <span>🚧</span>
              <div>
                <div className="farm3dm__toast-title">팜 2 비활성</div>
                <div className="farm3dm__toast-desc">현재 운영 준비 중입니다.</div>
              </div>
            </div>
          )}

          {/* ── 조작 힌트 ── */}
          {!isZoomedInFarm1 && (
            <div className="farm3dm__hint">
              <span className="farm3dm__hint-key">터치</span> 회전
              <span className="farm3dm__hint-sep">·</span>
              <span className="farm3dm__hint-key">핀치</span> 확대/축소
            </div>
          )}
        </div>
      )}

      <BottomNav
        active={showSettings ? 'settings' : showAi ? 'analytics' : showMarket ? 'market' : 'dashboard'}
        onSelect={(id) => {
          setShowSettings(false);
          setShowAi(false);
          setShowMarket(false);
          if (id === 'settings') setShowSettings(true);
          else if (id === 'analytics') setShowAi(true);
          else if (id === 'market') setShowMarket(true);
        }}
      />
      {showSettings && <SettingsOverlay onClose={() => setShowSettings(false)} />}
      {showAi && <AiOverlay onClose={() => setShowAi(false)} />}
      {showMarket && <MarketOverlay onClose={() => setShowMarket(false)} />}
    </div>
  );
}
