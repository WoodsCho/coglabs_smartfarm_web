import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  ACESFilmicToneMapping,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  StaticDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useWeather } from '../hooks/useWeather';
import { useFarm } from '../contexts/FarmContext';
import type { WeatherState } from '../hooks/useWeather';
import type { EnvironmentData } from '../types/farm';
import { Cpu, Video, VideoOff } from 'lucide-react';
import { equipmentApi } from '../api/equipment';
import './FarmModel3D.css';

// ────────────────────────────────────────────────────────
// DRACOLoader singleton (Draco 압축된 .glb 디코딩용)
// public/draco/gltf/ 경로에 draco_decoder.js, draco_wasm_wrapper.js 등이 있어야 함
// ────────────────────────────────────────────────────────
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/gltf/');
dracoLoader.setDecoderConfig({ type: 'js' });

const setupGLTFLoader = (loader: GLTFLoader) => {
  loader.setDRACOLoader(dracoLoader);
};

// ────────────────────────────────────────────────────────
// Camera controls + smooth animation
// ────────────────────────────────────────────────────────
type AnimTarget = { toPos: Vector3; toTarget: Vector3 } | null;

function CameraTracker({
  onUpdate,
  animRef,
}: {
  onUpdate: (pos: Vector3, target: Vector3) => void;
  animRef: React.MutableRefObject<AnimTarget>;
}) {
  const { camera } = useThree();
  const ctrlRef = useRef<any>(null);
  const isDev = import.meta.env.DEV;
  useFrame(() => {
    // dev에서만 카메라 정보 업데이트 (60fps setState 방지)
    if (isDev && ctrlRef.current) {
      onUpdate(camera.position.clone(), ctrlRef.current.target.clone());
    }
  });
  return <CameraControlsInner ctrlRef={ctrlRef} animRef={animRef} />;
}

function CameraControlsInner({
  ctrlRef,
  animRef,
}: {
  ctrlRef: React.MutableRefObject<any>;
  animRef: React.MutableRefObject<AnimTarget>;
}) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const ctrl = new OrbitControls(camera, gl.domElement);
    ctrl.target.set(18.30, 12.61, -4.26);
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.08;
    ctrl.minDistance = 2;
    ctrl.maxDistance = 100;
    ctrl.maxPolarAngle = Math.PI / 2;
    ctrlRef.current = ctrl;
    return () => {
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, [camera, gl.domElement, ctrlRef]);

  useFrame(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    if (animRef.current) {
      const { toPos, toTarget } = animRef.current;
      camera.position.lerp(toPos, 0.06);
      ctrl.target.lerp(toTarget, 0.06);
      if (camera.position.distanceTo(toPos) < 0.3) {
        camera.position.copy(toPos);
        ctrl.target.copy(toTarget);
        animRef.current = null;
      }
    }
    ctrl.update();
  });
  return null;
}

// ────────────────────────────────────────────────────────
// Ground plane
// ────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────
// Ground + 인스턴스 풀잎 (바람 애니메이션)
// ────────────────────────────────────────────────────────
const GRASS_VERT = `
  uniform float uTime;
  uniform float uWindStrength;
  attribute float aRandom;
  attribute float aHeight;
  varying vec2 vUv;
  varying float vHeight;

  void main() {
    vUv = uv;
    vHeight = position.y / aHeight;

    // 풀잎 끝부분만 바람에 흔들림
    float sway = sin(uTime * 1.8 + aRandom * 6.28) * uWindStrength * vHeight * vHeight;
    float swayZ = cos(uTime * 1.3 + aRandom * 3.14) * uWindStrength * 0.4 * vHeight * vHeight;

    vec3 pos = position;
    pos.x += sway;
    pos.z += swayZ;

    vec4 mvPos = instanceMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * mvPos;
  }
`;

const GRASS_FRAG = `
  varying vec2 vUv;
  varying float vHeight;
  uniform vec3 uColorBase;
  uniform vec3 uColorTip;

  void main() {
    vec3 color = mix(uColorBase, uColorTip, vHeight);
    float alpha = 1.0 - smoothstep(0.85, 1.0, vUv.x);
    gl_FragColor = vec4(color, alpha);
  }
`;

const GRASS_COUNT = 6000;
const FIELD_CENTER = new Vector3(18, 0, -5);
const FIELD_RADIUS = 60;

function GrassField({ weather }: { weather: WeatherState }) {
  const meshRef = useRef<InstancedMesh>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const timeRef = useRef(0);

  const { geometry, randomArr } = useMemo(() => {
    // 풀잎 형태: 가늘고 긴 삼각형 (끝이 뾰족)
    const geo = new BufferGeometry();
    const W = 0.06;
    const positions = new Float32Array([
      -W, 0,   0,
       W, 0,   0,
       0, 1.0, 0,
    ]);
    const uvs = new Float32Array([0, 0,  1, 0,  0.5, 1]);
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new BufferAttribute(uvs, 2));

    // 인스턴스별 랜덤값, 높이값
    const rand   = new Float32Array(GRASS_COUNT);
    const height = new Float32Array(GRASS_COUNT);
    for (let i = 0; i < GRASS_COUNT; i++) {
      rand[i]   = Math.random();
      height[i] = 0.4 + Math.random() * 0.8;
    }
    geo.setAttribute('aRandom', new BufferAttribute(rand, 1));
    geo.setAttribute('aHeight', new BufferAttribute(height, 1));

    return { geometry: geo, randomArr: { rand, height } };
  }, []);

  // geometry GPU 메모리 해제
  useEffect(() => () => { geometry.dispose(); }, [geometry]);

  // 인스턴스 행렬 초기화 (랜덤 위치/회전/스케일)
  useEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const mat4 = new Matrix4();
    const quat = new Quaternion();
    const scale = new Vector3();
    const pos = new Vector3();

    for (let i = 0; i < GRASS_COUNT; i++) {
      // 원형 범위 안 랜덤 배치 (스마트팜 건물 주변 제외)
      let x: number, z: number, dist: number;
      do {
        x = (Math.random() - 0.5) * FIELD_RADIUS * 2 + FIELD_CENTER.x;
        z = (Math.random() - 0.5) * FIELD_RADIUS * 2 + FIELD_CENTER.z;
        dist = Math.sqrt((x - FIELD_CENTER.x) ** 2 + (z - FIELD_CENTER.z) ** 2);
      } while (dist > FIELD_RADIUS || dist < 12); // 건물 중심 12단위 제외

      const h = randomArr.height[i];
      const rotY = Math.random() * Math.PI * 2;
      quat.setFromAxisAngle(new Vector3(0, 1, 0), rotY);
      scale.set(1, h, 1);
      pos.set(x, 0, z);
      mat4.compose(pos, quat, scale);
      mesh.setMatrixAt(i, mat4);
    }
    mesh.instanceMatrix.usage = StaticDrawUsage;
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // 날씨에 따른 풀 색상
  const { colorBase, colorTip, windStrength } = useMemo(() => {
    const { isDay, condition } = weather;
    let base = new Color(0x3a7d44);
    let tip  = new Color(0x7ec850);
    if (!isDay) { base = new Color(0x1a3a22); tip = new Color(0x2d5c33); }
    else if (condition === 'rain' || condition === 'thunderstorm') {
      base = new Color(0x2d5c33); tip = new Color(0x4a8c50);
    } else if (condition === 'clouds') {
      base = new Color(0x3a6b3f); tip = new Color(0x6aaa50);
    }
    const wind = condition === 'thunderstorm' ? 0.35
               : condition === 'rain'         ? 0.25
               : condition === 'clouds'       ? 0.18
               : 0.12;
    return { colorBase: base, colorTip: tip, windStrength: wind };
  }, [weather]);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    timeRef.current += delta;
    matRef.current.uniforms.uTime.value = timeRef.current;
    // windStrength/color 는 날씨 변경 시에만 업데이트 (useEffect)
  });

  // 날씨 변경 시에만 uniform 컬러/바람 업데이트
  useEffect(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uWindStrength.value = windStrength;
    matRef.current.uniforms.uColorBase.value = colorBase;
    matRef.current.uniforms.uColorTip.value  = colorTip;
  }, [windStrength, colorBase, colorTip]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, GRASS_COUNT]} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={GRASS_VERT}
        fragmentShader={GRASS_FRAG}
        uniforms={{
          uTime:        { value: 0 },
          uWindStrength: { value: windStrength },
          uColorBase:   { value: colorBase },
          uColorTip:    { value: colorTip },
        }}
        side={DoubleSide}
        transparent
      />
    </instancedMesh>
  );
}

function Ground({ weather }: { weather: WeatherState }) {
  // 날씨/시간에 따른 지면 색상
  const groundColor = useMemo(() => {
    const { isDay, condition } = weather;
    if (!isDay) return '#1a2e1e';
    if (condition === 'rain' || condition === 'thunderstorm') return '#4a5c40';
    if (condition === 'clouds') return '#7a9460';
    return '#6aaa50';
  }, [weather]);

  return (
    <>
      {/* 지면 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[18, -0.05, -5]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={groundColor} roughness={0.95} metalness={0} />
      </mesh>
      {/* 풀잎 */}
      <GrassField weather={weather} />
    </>
  );
}

// ────────────────────────────────────────────────────────
// 노드 이름 상수 (pipeline.glb 내부 Blender 오브젝트명)
// ────────────────────────────────────────────────────────
const NODE = {
  greenhouse: 'greenhouse',
  light1On:   'light1-on',
  light1Off:  'light1-off',
  light2On:   'light2-on',
  light2Off:  'light2-off',
  light3On:   'light3-on',
  light3Off:  'light3-off',
} as const;

// 재질 기본 설정 헬퍼
function applyMaterialDefaults(root: any) {
  root.traverse((obj: any) => {
    if (obj instanceof Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat: any) => {
        if (!mat) return;
        mat.side = DoubleSide;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = 1;
        mat.polygonOffsetUnits = 1;
        mat.needsUpdate = true;
      });
    }
  });
}

// 동일한 색상/속성의 머터리얼을 하나로 합쳐 드로우콜 감소
function deduplicateMaterials(root: any) {
  const cache = new Map<string, any>();

  const matKey = (mat: any): string => {
    if (!mat?.isMeshStandardMaterial && !mat?.isMeshPhysicalMaterial) return mat?.uuid ?? '';
    const c = mat.color;
    const e = mat.emissive;
    return [
      c.r.toFixed(3), c.g.toFixed(3), c.b.toFixed(3),
      (mat.opacity ?? 1).toFixed(2),
      (mat.roughness ?? 1).toFixed(2),
      (mat.metalness ?? 0).toFixed(2),
      mat.transparent ? '1' : '0',
      mat.map?.uuid ?? '0',
      e ? `${e.r.toFixed(2)},${e.g.toFixed(2)},${e.b.toFixed(2)}` : '0',
      (mat.emissiveIntensity ?? 0).toFixed(2),
    ].join('|');
  };

  let before = 0;
  let after = 0;

  root.traverse((obj: any) => {
    if (!(obj instanceof Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    before += mats.length;
    const merged = mats.map((mat: any) => {
      const key = matKey(mat);
      if (!key) return mat;
      if (cache.has(key)) return cache.get(key);
      cache.set(key, mat);
      return mat;
    });
    obj.material = Array.isArray(obj.material) ? merged : merged[0];
    after += (Array.isArray(obj.material) ? obj.material : [obj.material]).length;
  });

}

// ────────────────────────────────────────────────────────
// 통합 스마트팜 모델 — pipeline.glb 단일 파일로 모든 노드 제어
// ────────────────────────────────────────────────────────
function SmartfarmModel({
  url,
  led1On,
  led2On,
  led3On,
  showGreenhouse,
  onClick,
  onHoverChange,
}: {
  url: string;
  led1On: boolean;
  led2On: boolean;
  led3On: boolean;
  showGreenhouse: boolean;
  onClick: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const gltf = useLoader(GLTFLoader, url, setupGLTFLoader) as any;
  const { camera, gl } = useThree();
  const [hovered, setHovered] = useState(false);

  const { scene, ghNode } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    applyMaterialDefaults(cloned);
    deduplicateMaterials(cloned);
    const sz = new Box3().setFromObject(cloned).getSize(new Vector3()).length();
    const cam = camera as PerspectiveCamera;
    cam.near = Math.max(0.001, sz * 0.001);
    cam.far  = sz * 100;
    cam.updateProjectionMatrix();

    let foundGh: any = null;
    cloned.traverse((obj: any) => {
      if (obj.name && !foundGh && obj.name.toLowerCase().includes('greenhouse')) {
        foundGh = obj;
      }
    });
    return { scene: cloned, ghNode: foundGh };
  }, [gltf.scene, camera]);

  // 클론 씬 언마운트 시 GPU 메모리 해제
  useEffect(() => () => {
    scene.traverse((obj: any) => {
      obj.geometry?.dispose();
      if (obj.material) {
        (Array.isArray(obj.material) ? obj.material : [obj.material])
          .forEach((m: any) => m.dispose?.());
      }
    });
  }, [scene]);

  // GLB 로드 직후 모든 Light의 원래 intensity 저장 + 그룹 분류
  const spotGroupsRef = useRef<any[][]>([[], [], []]);
  useEffect(() => {
    const spots: any[] = [];
    scene.traverse((obj: any) => {
      if (obj.isLight) {
        if (obj._savedIntensity === undefined) obj._savedIntensity = obj.intensity / 1000;
        obj.intensity = obj._savedIntensity; // 초기 밝기도 1/10으로
        spots.push(obj);
      }
    });
    // 18개 Spot을 순서대로 3그룹으로 분할 (light3 / light2 / light1 — 1·3 swap)
    const size = Math.ceil(spots.length / 3);
    spotGroupsRef.current = [
      spots.slice(size * 2),       // led1 → 마지막 그룹
      spots.slice(size, size * 2), // led2 → 중간 그룹
      spots.slice(0, size),        // led3 → 첫 번째 그룹
    ];
  }, [scene]);

  // 씬에서 이름에 keyword가 포함된 그룹의 visibility 설정 — 결과 캐시로 traverse 최소화
  const nodeMapRef = useRef<Map<string, any[]>>(new Map());
  const setNodeGroupVisible = useMemo(() => (keyword: string, visible: boolean) => {
    const key = keyword.toLowerCase();
    if (!nodeMapRef.current.has(key)) {
      const found: any[] = [];
      scene.traverse((obj: any) => {
        if (obj.name && obj.name.toLowerCase().includes(key)) found.push(obj);
      });
      nodeMapRef.current.set(key, found);
    }
    nodeMapRef.current.get(key)!.forEach((obj: any) => {
      obj.traverse((child: any) => { child.visible = visible; });
      obj.visible = visible;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // 라이트 노드 ON/OFF
  useEffect(() => {
    const states = [led1On, led2On, led3On];
    // Spot 조명 그룹별 intensity 제어
    states.forEach((on, i) => {
      spotGroupsRef.current[i]?.forEach((light: any) => {
        light.intensity = on ? (light._savedIntensity ?? light.intensity) : 0;
      });
    });
    // -off 메시 그룹 visibility (OFF일 때 표시)
    const pairs = [
      { onKey: NODE.light1On, offKey: NODE.light1Off, state: led1On },
      { onKey: NODE.light2On, offKey: NODE.light2Off, state: led2On },
      { onKey: NODE.light3On, offKey: NODE.light3Off, state: led3On },
    ];
    pairs.forEach(({ onKey, offKey, state }) => {
      setNodeGroupVisible(offKey, !state);
      setNodeGroupVisible(onKey, state);
    });
  }, [led1On, led2On, led3On, scene]);

  // greenhouse 노드 show/hide
  useEffect(() => {
    if (ghNode) {
      ghNode.traverse((child: any) => { child.visible = showGreenhouse; });
      ghNode.visible = showGreenhouse;
    }
  }, [showGreenhouse, ghNode]);

  // greenhouse hover 하이라이트
  useEffect(() => {
    if (!ghNode) return;
    ghNode.traverse((obj: any) => {
      if (obj instanceof Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat: any) => {
          if (!mat?.emissive) return;
          mat.emissive.set(hovered ? 0x88ddff : 0x000000);
          mat.emissiveIntensity = hovered ? 0.5 : 0;
          mat.needsUpdate = true;
        });
      }
    });
  }, [hovered, ghNode]);

  // 커서
  useEffect(() => {
    gl.domElement.style.cursor = hovered && showGreenhouse ? 'pointer' : 'auto';
    return () => { gl.domElement.style.cursor = 'auto'; };
  }, [hovered, showGreenhouse, gl.domElement]);

  // 이벤트 대상이 greenhouse 노드 하위인지 확인
  const isInGreenhouse = (obj: any): boolean => {
    if (!ghNode) return false;
    let cur = obj;
    while (cur) {
      if (cur === ghNode) return true;
      cur = cur.parent;
    }
    return false;
  };

  return (
    <primitive
      object={scene}
      onPointerMove={(e: any) => {
        if (!showGreenhouse) return;
        const hit = isInGreenhouse(e.object);
        if (hit !== hovered) {
          setHovered(hit);
          onHoverChange(hit);
        }
      }}
      onPointerOut={() => {
        if (hovered) { setHovered(false); onHoverChange(false); }
      }}
      onClick={(e: any) => {
        if (!showGreenhouse) return;
        if (isInGreenhouse(e.object)) {
          e.stopPropagation();
          onClick();
        }
      }}
    />
  );
}

// ────────────────────────────────────────────────────────
// 팜2 모델 (greenhous2.glb — 추후 통합 GLB 교체 예정)
// ────────────────────────────────────────────────────────
function Greenhouse2Model({
  onClick,
  onHoverChange,
}: {
  onClick: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const gltf = useLoader(GLTFLoader, '/3d-model/greenhous2.glb', setupGLTFLoader) as any;
  const { camera, gl } = useThree();
  const [hovered, setHovered] = useState(false);

  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    applyMaterialDefaults(cloned);
    deduplicateMaterials(cloned);
    const sz = new Box3().setFromObject(cloned).getSize(new Vector3()).length();
    const cam = camera as PerspectiveCamera;
    cam.near = Math.max(0.001, sz * 0.001);
    cam.far  = sz * 100;
    cam.updateProjectionMatrix();
    return cloned;
  }, [gltf.scene, camera]);

  // 클론 씬 언마운트 시 GPU 메모리 해제
  useEffect(() => () => {
    scene.traverse((obj: any) => {
      obj.geometry?.dispose();
      if (obj.material) {
        (Array.isArray(obj.material) ? obj.material : [obj.material])
          .forEach((m: any) => m.dispose?.());
      }
    });
  }, [scene]);

  useEffect(() => {
    scene.traverse((obj: any) => {
      if (obj instanceof Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat: any) => {
          if (!mat?.emissive) return;
          mat.emissive.set(hovered ? 0x88ddff : 0x000000);
          mat.emissiveIntensity = hovered ? 0.5 : 0;
          mat.needsUpdate = true;
        });
      }
    });
  }, [hovered, scene]);

  useEffect(() => {
    gl.domElement.style.cursor = hovered ? 'pointer' : 'auto';
    return () => { gl.domElement.style.cursor = 'auto'; };
  }, [hovered, gl.domElement]);

  return (
    <primitive
      object={scene}
      onPointerOver={(e: any) => { e.stopPropagation(); setHovered(true); onHoverChange(true); }}
      onPointerOut={() => { setHovered(false); onHoverChange(false); }}
      onClick={(e: any) => { e.stopPropagation(); onClick(); }}
    />
  );
}

// ────────────────────────────────────────────────────────
// 날씨/시간 기반 환경 조명
// ────────────────────────────────────────────────────────
function WeatherLighting({ weather }: { weather: WeatherState }) {
  const { scene } = useThree();

  useEffect(() => {
    const { isDay, sunProgress, condition } = weather;

    // 하늘 배경색 계산
    let skyColor: Color;
    if (!isDay) {
      // 밤: 어두운 남색
      skyColor = new Color(0x0a0f1e);
    } else if (condition === 'rain' || condition === 'thunderstorm') {
      skyColor = new Color(0x4a5568);
    } else if (condition === 'clouds') {
      skyColor = new Color(0x9eafc2);
    } else if (condition === 'mist') {
      skyColor = new Color(0xc8d4dc);
    } else {
      // 맑은 낮: 일출/일몰 주황→파랑→주황
      if (sunProgress < 0.15) {
        skyColor = new Color(0xf97316).lerp(new Color(0x60a5fa), sunProgress / 0.15);
      } else if (sunProgress > 0.85) {
        skyColor = new Color(0x60a5fa).lerp(new Color(0xf97316), (sunProgress - 0.85) / 0.15);
      } else {
        skyColor = new Color(0x87ceeb);
      }
    }
    // 배경색 동기화
    scene.background = skyColor;
  }, [weather, scene]);

  // ambient: 낮=밝음, 밤=어두움, 흐림=줄어듦
  const { isDay, sunProgress, cloudiness, condition } = weather;
  const ambientBase = isDay ? 1.2 : 0.15;
  const cloudDim = 1 - cloudiness * 0.5;
  const ambientIntensity = ambientBase * cloudDim;

  // 태양 directional light: 낮에만 활성화
  // sunProgress 0=동쪽, 0.5=정남, 1=서쪽
  const sunAngle = (sunProgress - 0.5) * Math.PI; // -π/2 ~ π/2
  const sunHeight = Math.sin((1 - Math.abs(sunProgress * 2 - 1)) * Math.PI * 0.5);
  const sunX = Math.sin(sunAngle) * 30;
  const sunY = Math.max(0.1, sunHeight * 20);
  const sunZ = -10;

  // 태양 색: 일출/일몰=주황, 정오=흰색
  const sunColor = sunProgress < 0.15 || sunProgress > 0.85 ? 0xffaa44 : 0xffffff;
  const sunIntensity = isDay ? Math.max(0, sunHeight) * (1 - cloudiness * 0.7) * 3.0 : 0;

  // 달빛: 밤에 약하게
  const moonIntensity = !isDay ? 0.3 : 0;

  // 비/우박: 흐린 날 파란빛 추가
  const rainTint = (condition === 'rain' || condition === 'thunderstorm') ? 0.4 : 0;

  return (
    <>
      <ambientLight intensity={ambientIntensity} color={isDay ? 0xffffff : 0x334466} />
      {/* 태양 */}
      {isDay && (
        <directionalLight
          position={[sunX, sunY, sunZ]}
          intensity={sunIntensity}
          color={sunColor}
          castShadow
        />
      )}
      {/* 달빛 */}
      {!isDay && (
        <directionalLight position={[10, 15, -5]} intensity={moonIntensity} color={0x8899cc} />
      )}
      {/* 보조광 (그림자 채움) */}
      <directionalLight position={[-8, 4, -2]} intensity={isDay ? 0.8 * cloudDim : 0.1} color={isDay ? 0xffffff : 0x334466} />
      {/* 비 오는 날 파란 채움광 */}
      {rainTint > 0 && <ambientLight intensity={rainTint} color={0x6688aa} />}
    </>
  );
}

// ────────────────────────────────────────────────────────
// Scene composition
// ────────────────────────────────────────────────────────
interface SceneProps {
  led1On: boolean;
  led2On: boolean;
  led3On: boolean;
  showGreenhouse: boolean;
  showFarm1: boolean;
  showFarm2: boolean;
  showPipeline2: boolean;
  animRef: React.MutableRefObject<AnimTarget>;
  onCameraUpdate: (pos: Vector3, target: Vector3) => void;
  onGreenhouseClick: () => void;
  onGreenhouseHover: (hovered: boolean) => void;
  onGreenhouse2Click: () => void;
  onGreenhouse2Hover: (hovered: boolean) => void;
  weather: WeatherState;
}

function Scene({
  led1On, led2On, led3On,
  showGreenhouse, showFarm1, showFarm2, showPipeline2,
  animRef, onCameraUpdate,
  onGreenhouseClick, onGreenhouseHover,
  onGreenhouse2Click, onGreenhouse2Hover,
  weather,
}: SceneProps) {
  const { scene } = useThree();

  // 배경색 — WeatherLighting 에서 처리하므로 여기서는 cleanup만
  useEffect(() => () => { scene.background = null; }, [scene]);

  return (
    <>
      <WeatherLighting weather={weather} />
      <Ground weather={weather} />
      <Suspense fallback={null}>
        {/* 팜1: pipeline.glb 하나에 greenhouse + lights 모두 포함 */}
        {showFarm1 && (
          <SmartfarmModel
            url="/3d-model/pipeline.glb"
            led1On={led1On}
            led2On={led2On}
            led3On={led3On}
            showGreenhouse={showGreenhouse}
            onClick={onGreenhouseClick}
            onHoverChange={onGreenhouseHover}
          />
        )}
        {/* 팜2: 추후 통합 GLB 교체 예정 */}
        {showFarm2 && (
          <Greenhouse2Model
            onClick={onGreenhouse2Click}
            onHoverChange={onGreenhouse2Hover}
          />
        )}
        {showPipeline2 && (
          <SmartfarmModel
            url="/3d-model/pipeline2.glb"
            led1On={false}
            led2On={false}
            led3On={false}
            showGreenhouse={false}
            onClick={() => {}}
            onHoverChange={() => {}}
          />
        )}
      </Suspense>

      <CameraTracker onUpdate={onCameraUpdate} animRef={animRef} />
    </>
  );
}

// ────────────────────────────────────────────────────────
// 낮/밤 진행 오버레이 (상단 중앙)
// ────────────────────────────────────────────────────────
function DayProgressOverlay({ weather, time }: { weather: WeatherState; time: Date }) {
  if (weather.loading) return null;
  const { isDay, sunProgress } = weather;
  const timeStr = time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const pct = Math.max(2, Math.min(97, sunProgress * 100));
  return (
    <div className="farm3d__day-overlay">
      <span className="farm3d__day-time">{timeStr}</span>
      <div className="farm3d__day-track">
        <div className="farm3d__day-fill" style={{ width: `${pct}%` }} />
        <span className="farm3d__day-icon" style={{ left: `${pct}%` }}>
          {isDay ? '☀️' : '🌙'}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 캔버스 내 미니 센서 오버레이 (우상단)
// ────────────────────────────────────────────────────────
function SensorOverlay({ data }: { data: EnvironmentData }) {
  const items = useMemo(() => [
    { key: 'temp', icon: '🌡️', label: '온도',  value: `${data.temperature.toFixed(1)}°C`,  color: '#fb7185' },
    { key: 'hum',  icon: '💧', label: '습도',  value: `${data.humidity.toFixed(1)}%`,      color: '#38bdf8' },
    { key: 'co2',  icon: '💨', label: 'CO₂',   value: `${data.co2.toFixed(0)} ppm`,        color: '#a78bfa' },
    { key: 'ec',   icon: '⚡', label: 'EC',    value: `${data.ec.toFixed(1)} dS/m`,        color: '#facc15' },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [data.temperature, data.humidity, data.co2, data.ec]);
  return (
    <div className="farm3d__sensor-overlay">
      <div className="farm3d__sensor-overlay-title">실시간 환경</div>
      {items.map(it => (
        <div key={it.key} className="farm3d__sensor-overlay-row">
          <span className="farm3d__sensor-overlay-icon">{it.icon}</span>
          <span className="farm3d__sensor-overlay-label">{it.label}</span>
          <span className="farm3d__sensor-overlay-val" style={{ color: it.color }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 좌측 팜 상태 종합 패널
// ────────────────────────────────────────────────────────
function FarmStatusPanel({ data }: { data: EnvironmentData }) {
  const { equipmentGroups } = useFarm();

  const envItems = useMemo(() => [
    { key: 'temp',  icon: '🌡️', label: '온도',     value: `${data.temperature.toFixed(1)}°C`,  color: '#fb7185' },
    { key: 'hum',   icon: '💧', label: '습도',     value: `${data.humidity.toFixed(1)}%`,      color: '#38bdf8' },
    { key: 'co2',   icon: '💨', label: 'CO₂',      value: `${data.co2.toFixed(0)} ppm`,        color: '#a78bfa' },
    { key: 'light', icon: '☀️', label: '조도',     value: `${data.light.toFixed(0)}%`,         color: '#fbbf24' },
    { key: 'ph',    icon: '🧪', label: 'pH',       value: data.ph.toFixed(1),                  color: '#34d399' },
    { key: 'ec',    icon: '⚡', label: 'EC',       value: `${data.ec.toFixed(1)} dS/m`,        color: '#facc15' },
    { key: 'wtemp', icon: '🌊', label: '수온',     value: `${data.waterTemp.toFixed(1)}°C`,    color: '#22d3ee' },
    { key: 'o2',    icon: '🫧', label: '용존산소', value: `${data.oxygenLevel.toFixed(1)} mg/L`, color: '#86efac' },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [data.temperature, data.humidity, data.co2, data.light, data.ph, data.ec, data.waterTemp, data.oxygenLevel]);

  const equipSummary = useMemo(() => equipmentGroups.map(grp => {
    const on = grp.equipment.filter(e => e.status !== 'OFF').length;
    const total = grp.equipment.length;
    return { icon: grp.icon, name: grp.displayName, on, total, color: grp.color };
  }), [equipmentGroups]);

  return (
    <div className="farm3d__status-panel">
      {/* 환경 섹션 */}
      <div className="farm3d__status-section-label">실시간 환경</div>
      <div className="farm3d__status-env-grid">
        {envItems.map(it => (
          <div key={it.key} className="farm3d__status-env-cell">
            <span className="farm3d__status-env-icon">{it.icon}</span>
            <span className="farm3d__status-env-label">{it.label}</span>
            <span className="farm3d__status-env-val" style={{ color: it.color }}>{it.value}</span>
          </div>
        ))}
      </div>

      {/* 설비 섹션 */}
      <div className="farm3d__status-section-label farm3d__status-section-label--mt">설비 현황</div>
      <div className="farm3d__status-equip-list">
        {equipSummary.map(eq => (
          <div key={eq.name} className="farm3d__status-equip-row">
            <span className="farm3d__status-equip-name">{eq.name}</span>
            <span className="farm3d__status-equip-count" style={{ color: eq.on > 0 ? eq.color : '#6b7280' }}>
              {eq.on}/{eq.total} ON
            </span>
            <div className="farm3d__status-equip-bar">
              <div className="farm3d__status-equip-bar-fill" style={{ width: `${(eq.on / eq.total) * 100}%`, background: eq.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 날씨 강수 파티클 (비 / 눈)
// ────────────────────────────────────────────────────────
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
    <div className="farm3d__precip">
      {items.map(item => (
        <span
          key={item.id}
          className={isSnow ? 'farm3d__precip-flake' : 'farm3d__precip-drop'}
          style={{
            left: `${item.left}%`,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.duration}s`,
            opacity: item.opacity,
            ...(isRain
              ? { height: `${item.h}px` }
              : { width: `${item.sz}px`, height: `${item.sz}px` }),
          }}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// LED status indicator
// ────────────────────────────────────────────────────────
function LedIndicator({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="farm3d__led">
      <span
        className="farm3d__led-dot"
        style={{
          background: on ? '#FCD34D' : '#D1D5DB',
          boxShadow: on ? '0 0 6px rgba(252, 211, 77, 0.85)' : 'none',
        }}
      />
      <span className="farm3d__led-label" style={{ color: on ? '#92400E' : '#9CA3AF' }}>
        {label}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 날씨 위젯
// ────────────────────────────────────────────────────────
const WEATHER_ICONS: Record<string, string> = {
  clear: '☀️', clouds: '⛅', rain: '🌧️',
  snow: '❄️', thunderstorm: '⛈️', mist: '🌫️',
};
const WEATHER_LABELS: Record<string, string> = {
  clear: '맑음', clouds: '흐림', rain: '비',
  snow: '눈', thunderstorm: '폭풍', mist: '안개',
};

function WeatherWidget({ weather }: { weather: WeatherState }) {
  if (weather.loading) return null;
  const icon  = WEATHER_ICONS[weather.condition]  ?? '🌤️';
  const label = WEATHER_LABELS[weather.condition] ?? weather.condition;
  const timeLabel = weather.isDay ? '낮' : '밤';
  const hasTemp = weather.temperature !== 0 || weather.condition !== 'clear';
  return (
    <div className="farm3d__weather-widget">
      <span className="farm3d__weather-icon">{icon}</span>
      <div className="farm3d__weather-info">
        {hasTemp && (
          <span className="farm3d__weather-temp">{weather.temperature.toFixed(1)}°</span>
        )}
        <div className="farm3d__weather-meta">
          <span className="farm3d__weather-label">{label}</span>
          <span className="farm3d__weather-divider">·</span>
          <span className="farm3d__weather-sub">장성군 {timeLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────
export interface FarmModel3DProps {
  led1On?: boolean;
  led2On?: boolean;
  led3On?: boolean;
  sensorData?: EnvironmentData;
}

const OVERVIEW_POS    = new Vector3(69.64, 21.04, -41.63);
const OVERVIEW_TARGET = new Vector3(18.30, 12.61,  -4.26);

// 파이프라인1 줌인 — 카메라 디버거로 확인 후 조정
const PIPELINE1_POS    = new Vector3(47.32, 17.89, -28.11);
const PIPELINE1_TARGET = new Vector3(18.59,  7.01,  -4.41);

// 팜1 식물 상태 확인 시 클로즈업 좌표
const PLANT_CHECK_POS    = new Vector3( 8.07, 7.83, -10.54);
const PLANT_CHECK_TARGET = new Vector3( 8.08, 7.83,  -7.98);


const FUNNEL_BASE = 'https://k8s-worker02.tail63c20e.ts.net';
const CAMERAS = [
  { id: 'cam2', label: 'CAM 1' },
  { id: 'cam1', label: 'CAM 2' },
];

function CctvMiniPanel() {
  return (
    <div className="farm3d__cctv-mini-panel">
      {CAMERAS.map(cam => (
        <div key={cam.id} className="farm3d__cctv-mini-cam">
          <div className="farm3d__cctv-mini-header">
            <span className="farm3d__cctv-live-dot" />
            <span className="farm3d__cctv-mini-label">{cam.label}</span>
          </div>
          <iframe
            src={`${FUNNEL_BASE}/${cam.id}`}
            className="farm3d__cctv-mini-frame"
            allow="autoplay"
            allowFullScreen={false}
          />
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// AI 식물 상태 분석 — 목 데이터 (하루 1회 CCTV 분석 결과)
// ────────────────────────────────────────────────────────
const MOCK_PLANT_ANALYSIS = {
  analyzedAt: '2026-05-11 06:00',
  summary: '파이프 내 식물 없음 — 정식 준비 단계',
  status: 'empty' as 'healthy' | 'warning' | 'empty',
  details: [
    { icon: '🪴', label: '정식 여부', value: '미정식 (Net pot 슬롯 비어있음)' },
    { icon: '🌱', label: '육묘 상태', value: '하단 플러그 트레이 발아 진행 중' },
    { icon: '💧', label: '배관 상태', value: '정상 — 양액 공급 배관 이상 없음' },
    { icon: '📡', label: '센서 모듈', value: '각 열 부착 센서 정상 감지 중' },
    { icon: '📅', label: '정식 예상', value: '발아 완료 후 약 7~10일 내 가능' },
  ],
  recommendation: '현재 파이프에 식물이 없습니다. 육묘 트레이의 발아 상태를 확인 후 정식 일정을 수립하세요.',
};

function PlantStatusPanel() {
  const { status, summary, analyzedAt, details, recommendation } = MOCK_PLANT_ANALYSIS;
  const statusColor = status === 'healthy' ? '#34d399' : status === 'warning' ? '#fbbf24' : '#94a3b8';
  const statusLabel = status === 'healthy' ? '정상' : status === 'warning' ? '주의' : '비어있음';
  return (
    <div className="farm3d__plant-panel">
      <div className="farm3d__plant-panel-header">
        <div className="farm3d__plant-panel-title">🌿 AI 식물 상태 분석</div>
        <div className="farm3d__plant-panel-time">분석 시각: {analyzedAt}</div>
      </div>
      <div className="farm3d__plant-status-badge" style={{ borderColor: statusColor, color: statusColor }}>
        <span className="farm3d__plant-status-dot" style={{ background: statusColor }} />
        {statusLabel}
      </div>
      <div className="farm3d__plant-summary">{summary}</div>
      <div className="farm3d__plant-details">
        {details.map((d, i) => (
          <div key={i} className="farm3d__plant-detail-row">
            <span className="farm3d__plant-detail-icon">{d.icon}</span>
            <div className="farm3d__plant-detail-content">
              <span className="farm3d__plant-detail-label">{d.label}</span>
              <span className="farm3d__plant-detail-value">{d.value}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="farm3d__plant-recommendation">
        <span className="farm3d__plant-rec-icon">💡</span>
        {recommendation}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Farm 1 진입 시 나타나는 LED/식물상태 컨트롤 패널
// ────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────
// 온실 스펙 패널 (팜1 진입 뷰 좌측)
// ────────────────────────────────────────────────────────
function GreenhouseSpecPanel() {
  return (
    <div className="farm3d__gh-spec-panel">
      <div className="farm3d__gh-spec-title">🏭 온실 스펙</div>

      <div className="farm3d__gh-spec-section-label">재배</div>
      <div className="farm3d__gh-spec-row">
        <span className="farm3d__gh-spec-key">면적</span>
        <span className="farm3d__gh-spec-val">2.5평</span>
      </div>
      <div className="farm3d__gh-spec-row">
        <span className="farm3d__gh-spec-key">모종 수</span>
        <span className="farm3d__gh-spec-val highlight">324 모종</span>
      </div>

      <div className="farm3d__gh-spec-divider" />

      <div className="farm3d__gh-spec-section-label">히트펌프</div>
      <div className="farm3d__gh-spec-row">
        <span className="farm3d__gh-spec-key">용량</span>
        <span className="farm3d__gh-spec-val">1 PS</span>
      </div>
      <div className="farm3d__gh-spec-row">
        <span className="farm3d__gh-spec-key">사용 수온</span>
        <span className="farm3d__gh-spec-val">7 ~ 25 °C</span>
      </div>

      <div className="farm3d__gh-spec-row-group">
        <div className="farm3d__gh-spec-chip heating">
          <span className="farm3d__gh-spec-chip-label">난방</span>
          <span className="farm3d__gh-spec-chip-val">2,600 kcal/h</span>
          <span className="farm3d__gh-spec-chip-power">1.2 kW</span>
        </div>
        <div className="farm3d__gh-spec-chip cooling">
          <span className="farm3d__gh-spec-chip-label">냉방</span>
          <span className="farm3d__gh-spec-chip-val">2,400 kcal/h</span>
          <span className="farm3d__gh-spec-chip-power">1.3 kW</span>
        </div>
      </div>
    </div>
  );
}
interface Farm1ControlPanelProps {
  led1: boolean; led2: boolean; led3: boolean;
  onToggleLed: (id: number, next: boolean) => void;
  onCheckPlants: () => void;
}
function Farm1ControlPanel({ led1, led2, led3, onToggleLed, onCheckPlants }: Farm1ControlPanelProps) {
  const leds = [
    { id: 1, label: 'LED 1', on: led1 },
    { id: 2, label: 'LED 2', on: led2 },
    { id: 3, label: 'LED 3', on: led3 },
  ];
  return (
    <div className="farm3d__farm1-panel">
      <div className="farm3d__farm1-panel-title">팜 1 제어</div>
      <div className="farm3d__farm1-led-row">
        {leds.map(({ id, label, on }) => (
          <button
            key={id}
            className={`farm3d__farm1-led-btn${on ? ' farm3d__farm1-led-btn--on' : ''}`}
            onClick={() => onToggleLed(id, !on)}
          >
            <span className={`farm3d__farm1-led-dot${on ? ' farm3d__farm1-led-dot--on' : ''}`} />
            {label}
            <span className="farm3d__farm1-led-status">{on ? 'ON' : 'OFF'}</span>
          </button>
        ))}
      </div>
      <button className="farm3d__farm1-plants-btn" onClick={onCheckPlants}>
        🌿 현재 식물 상태 확인
      </button>
    </div>
  );
}

// 기본 센서 데이터 (sensorData prop 없을 때 fallback)
const DEFAULT_SENSOR: EnvironmentData = {
  temperature: 0, humidity: 0, co2: 0, light: 0,
  ph: 0, ec: 0, waterTemp: 0, oxygenLevel: 0,
};

export default function FarmModel3D({ led1On = false, led2On = false, led3On = false, sensorData = DEFAULT_SENSOR }: FarmModel3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimTarget>(null);
  const weather = useWeather();
  const { toggleEquipmentStatus } = useFarm();

  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    // 1분마다만 갱신 (초 단위 표시 없으므로 충분)
    const id = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const timeStr = currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selectedFarm, setSelectedFarm] = useState<'farm1' | 'farm2'>('farm1');
  const [canvasKey,    setCanvasKey]    = useState(0);
  const [showGreenhouse, setShowGreenhouse] = useState(true); // 팜1 greenhouse 노드
  const [showFarm1,      setShowFarm1]      = useState(true);  // 팜1 전체
  const [showFarm2,      setShowFarm2]      = useState(false); // 팜2 전체 (초기: 팜1 선택)
  const [showPipeline2,  setShowPipeline2]  = useState(false); // pipeline2.glb (팜2 세트, 초기: 팜1 선택이므로 false)
  const [camInfo,        setCamInfo]        = useState<{ pos: Vector3; target: Vector3 } | null>(null);
  const [showCctv,       setShowCctv]       = useState(false);
  const [farm1Hovered,     setFarm1Hovered]     = useState(false);
  const [farm2Hovered,     setFarm2Hovered]     = useState(false);
  const [isZoomedInFarm1,  setIsZoomedInFarm1]  = useState(false);
  const [isPlantCheckView, setIsPlantCheckView] = useState(false);
  const [farm2Disabled, setFarm2Disabled] = useState(false);
  const farm2TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (farm2TimerRef.current) clearTimeout(farm2TimerRef.current); }, []);
  // 팜1 진입 시 로컬 LED 제어 (props 초기값으로 초기화)
  const [localLed1, setLocalLed1] = useState(led1On);
  const [localLed2, setLocalLed2] = useState(led2On);
  const [localLed3, setLocalLed3] = useState(led3On);
  // props 변경 시 동기화 (팜1 진입 전에만)
  useEffect(() => { if (!isZoomedInFarm1) { setLocalLed1(led1On); setLocalLed2(led2On); setLocalLed3(led3On); } }, [led1On, led2On, led3On, isZoomedInFarm1]);

  const fmtVec = (v: Vector3) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

  const handleCameraUpdate = (pos: Vector3, target: Vector3) => { setCamInfo({ pos, target }); };

  const handleFarm1Click = () => {
    setShowGreenhouse(false); // greenhouse 노드 숨김
    setShowFarm2(false);      // 팜2 전체 숨김
    setShowPipeline2(false);  // pipeline2 숨김
    setFarm1Hovered(false);
    setIsZoomedInFarm1(true);
    animRef.current = { toPos: PIPELINE1_POS.clone(), toTarget: PIPELINE1_TARGET.clone() };
  };

  const handleFarm2Click = () => {
    // 팜2 비활성 — 토스트 표시 후 3초 자동 해제
    setFarm2Disabled(true);
    setFarm2Hovered(false);
    if (farm2TimerRef.current) clearTimeout(farm2TimerRef.current);
    farm2TimerRef.current = setTimeout(() => setFarm2Disabled(false), 3000);
  };

  const handleFarmSwitch = (farm: 'farm1' | 'farm2') => {
    if (farm === selectedFarm) return;
    setSelectedFarm(farm);
    setCanvasKey(k => k + 1); // Canvas 재마운트 → GPU 메모리 해제
    setShowCctv(false);
    setIsZoomedInFarm1(false);
    setIsPlantCheckView(false);
    setFarm1Hovered(false);
    setFarm2Hovered(false);
    setFarm2Disabled(false);
    setShowGreenhouse(true);
    setShowFarm1(farm === 'farm1');
    setShowFarm2(farm === 'farm2');
    setShowPipeline2(farm === 'farm2'); // pipeline2.glb는 팜2 세트
    animRef.current = null;
  };

  const handleBackClick = () => {
    if (isPlantCheckView) {
      // 식물상태확인 → 팜1 뷰로 복귀
      setIsPlantCheckView(false);
      animRef.current = { toPos: PIPELINE1_POS.clone(), toTarget: PIPELINE1_TARGET.clone() };
      return;
    }
    setShowGreenhouse(true);
    setShowFarm1(selectedFarm === 'farm1');
    setShowFarm2(selectedFarm === 'farm2');
    setShowPipeline2(selectedFarm === 'farm2'); // pipeline2.glb는 팜2 세트
    setIsZoomedInFarm1(false);
    animRef.current = { toPos: OVERVIEW_POS.clone(), toTarget: OVERVIEW_TARGET.clone() };
  };

  // 팜별로 독립 렌더링하므로 showFarm2=false가 항상 isZoomedIn=true가 되는 것을 방지
  const isZoomedIn = isZoomedInFarm1;

  // ResizeObserver 로 컨테이너 크기 추적 → Canvas 크기 동기화
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        setSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="farm3d">
      {/* 패널 헤더 */}
      <div className="farm3d__header">
        <div className="farm3d__title-row">
          <div className="farm3d__live-badge">
            <span className="farm3d__live-dot" />
            LIVE
          </div>
          <Cpu size={14} color="#374151" />
          <span className="farm3d__title">3D 스마트팜 모델</span>
        </div>
        <div className="farm3d__header-right">
          <span className="farm3d__header-time">{timeStr}</span>
          <div className="farm3d__leds">
            <LedIndicator label="LED 1" on={led1On} />
            <LedIndicator label="LED 2" on={led2On} />
            <LedIndicator label="LED 3" on={led3On} />
          </div>
        </div>
      </div>

      {/* Canvas 또는 CCTV 영상 */}
      {showCctv ? (
        <div className="farm3d__cctv-wrap">
          {CAMERAS.map(cam => (
            <div key={cam.id} className="farm3d__cctv-cam">
              <div className="farm3d__cctv-cam-header">
                <span className="farm3d__cctv-live-dot" />
                <span className="farm3d__cctv-cam-label">{cam.label}</span>
              </div>
              <iframe
                src={`${FUNNEL_BASE}/${cam.id}`}
                className="farm3d__cctv-frame"
                allow="autoplay"
                allowFullScreen
              />
            </div>
          ))}
          <button
            className="farm3d__cctv-btn farm3d__cctv-btn--close"
            onClick={() => setShowCctv(false)}
          >
            <VideoOff size={13} />
            닫기
          </button>
        </div>
      ) : (
        <div ref={wrapRef} className="farm3d__canvas-wrap">
          {size.w > 0 && size.h > 0 && (
            <Canvas
              key={canvasKey}
              camera={{ position: [69.64, 21.04, -41.63], fov: 45, near: 0.001, far: 10000 }}
              style={{ width: size.w, height: size.h, display: 'block' }}
              dpr={Math.min(window.devicePixelRatio, 1.5)}
              gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.3, powerPreference: 'high-performance' }}
              resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
            >
              <Scene
                led1On={led1On}
                led2On={led2On}
                led3On={led3On}
                showGreenhouse={showGreenhouse}
                showFarm1={showFarm1}
                showFarm2={showFarm2}
                showPipeline2={showPipeline2}
                animRef={animRef}
                onCameraUpdate={handleCameraUpdate}
                onGreenhouseClick={handleFarm1Click}
                onGreenhouseHover={setFarm1Hovered}
                onGreenhouse2Click={handleFarm2Click}
                onGreenhouse2Hover={setFarm2Hovered}
                weather={weather}
              />
            </Canvas>
          )}

          {/* 카메라 좌표 디버거 (개발 모드 전용) */}
          {import.meta.env.DEV && camInfo && (
            <div className="farm3d__cam-debug">
              <span>📷 pos&nbsp;&nbsp;{fmtVec(camInfo.pos)}</span>
              <span>🎯 target {fmtVec(camInfo.target)}</span>
            </div>
          )}

          {/* 낮/밤 진행 오버레이 */}
          <DayProgressOverlay weather={weather} time={currentTime} />

          {/* 팜2: 오픈 준비중 */}
          {selectedFarm === 'farm2' && (
            <div className="farm3d__coming-soon">
              <div className="farm3d__coming-soon-icon">🌱</div>
              <div className="farm3d__coming-soon-title">오픈 준비중</div>
              <div className="farm3d__coming-soon-sub">Farm 2는 곧 만나보실 수 있습니다</div>
            </div>
          )}

          {/* 팜1 좌측 패널: 기본뷰=온실스펙, 진입뷰=실시간 환경+설비 */}
          {selectedFarm === 'farm1' && !isPlantCheckView && (
            isZoomedInFarm1
              ? <FarmStatusPanel data={sensorData} />
              : <GreenhouseSpecPanel />
          )}

          {/* 날씨 강수 파티클 — 온실(팜1) 진입 시 숨김 */}
          {!weather.loading && !isZoomedInFarm1 && <PrecipitationOverlay condition={weather.condition} />}

          {/* 팜 선택 버튼 — 팜1 전체보기 상태에서만 */}
          {!isZoomedIn && selectedFarm === 'farm1' && (
            <div className="farm3d__farm-select-btns">
              <button
                className={`farm3d__farm-btn${farm1Hovered ? ' farm3d__farm-btn--hovered' : ''}`}
                onClick={handleFarm1Click}
                onMouseEnter={() => setFarm1Hovered(true)}
                onMouseLeave={() => setFarm1Hovered(false)}
              >
                <span className="farm3d__farm-btn-emoji">🏭</span>
                <span className="farm3d__farm-btn-text">
                  <span className="farm3d__farm-btn-name">팜 1</span>
                  <span className="farm3d__farm-btn-sub">진입하기 →</span>
                </span>
              </button>
            </div>
          )}

          {/* CCTV 미니 피드 오버레이 — 팜1 기본뷰 우측 하단 */}
          {!isZoomedIn && selectedFarm === 'farm1' && (
            <div className="farm3d__cctv-mini-panel">
              <button
                className="farm3d__cctv-mini-detail-btn"
                onClick={() => setShowCctv(true)}
              >
                <Video size={12} /> CCTV 상세보기
              </button>
              {CAMERAS.map(cam => (
                <div key={cam.id} className="farm3d__cctv-mini-cam">
                  <div className="farm3d__cctv-mini-header">
                    <span className="farm3d__cctv-live-dot" />
                    <span className="farm3d__cctv-mini-label">{cam.label}</span>
                  </div>
                  <iframe
                    src={`${FUNNEL_BASE}/${cam.id}`}
                    className="farm3d__cctv-mini-frame"
                    allow="autoplay"
                    allowFullScreen={false}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 팜 이름 라벨 (상단 중앙) */}
          <div className="farm3d__farm-name-label">
            <span className="farm3d__farm-name-badge">
              {selectedFarm === 'farm1' ? 'FARM 1' : 'FARM 2'}
            </span>
            <span className="farm3d__farm-name-text">
              {selectedFarm === 'farm1' ? 'MVP 스마트팜' : 'CogLabs 스마트팜 2호'}
            </span>
          </div>

          {/* 날씨 위젯 + 팜 탭 (좌상단 한 줄) */}
          <div className="farm3d__top-left-bar">
            <WeatherWidget weather={weather} />
            {!showCctv && (
              <div className="farm3d__farm-tabs-overlay">
                <button
                  className={`farm3d__farm-tab${selectedFarm === 'farm1' ? ' farm3d__farm-tab--active' : ''}`}
                  onClick={() => handleFarmSwitch('farm1')}
                >팜 1</button>
                <button
                  className={`farm3d__farm-tab${selectedFarm === 'farm2' ? ' farm3d__farm-tab--active' : ''}`}
                  onClick={() => handleFarmSwitch('farm2')}
                >팜 2</button>
              </div>
            )}
          </div>
          {showGreenhouse && farm1Hovered && !isZoomedIn && (
            <div className="farm3d__hover-tooltip farm3d__hover-tooltip--left">
              <div className="farm3d__hover-tooltip-title">
                <span className="farm3d__hover-tooltip-icon">🏭</span>
                <span>MVP용 스마트팜</span>
              </div>
              <div className="farm3d__hover-tooltip-body">
                <div className="farm3d__hover-tooltip-row">
                  <span className="farm3d__hover-tooltip-key">주소</span>
                  <span className="farm3d__hover-tooltip-val">대악길 19-11</span>
                </div>
                <div className="farm3d__hover-tooltip-row">
                  <span className="farm3d__hover-tooltip-key">수확 횟수</span>
                  <span className="farm3d__hover-tooltip-val">1회</span>
                </div>
              </div>
              <div className="farm3d__hover-tooltip-hint">클릭하여 진입</div>
            </div>
          )}

          {/* 팜2 hover 툴팁 */}
          {showFarm2 && farm2Hovered && !farm1Hovered && !isZoomedIn && (
            <div className="farm3d__hover-tooltip farm3d__hover-tooltip--right">
              <div className="farm3d__hover-tooltip-title">
                <span className="farm3d__hover-tooltip-icon">🏭</span>
                <span>MVP용 스마트팜 2</span>
              </div>
              <div className="farm3d__hover-tooltip-body">
                <div className="farm3d__hover-tooltip-row">
                  <span className="farm3d__hover-tooltip-key">주소</span>
                  <span className="farm3d__hover-tooltip-val">대악길 19-11</span>
                </div>
                <div className="farm3d__hover-tooltip-row">
                  <span className="farm3d__hover-tooltip-key">수확 횟수</span>
                  <span className="farm3d__hover-tooltip-val">1회</span>
                </div>
              </div>
              <div className="farm3d__hover-tooltip-hint">클릭하여 진입</div>
            </div>
          )}

          {/* 전체보기 복귀 버튼 */}
          {isZoomedIn && (
            <button className="farm3d__back-btn" onClick={handleBackClick}>
              ← 전체보기
            </button>
          )}

          {/* 팜1 진입 시 LED 컨트롤 패널 + CCTV 미니 (식물상태확인 클로즈업 뷰에서는 숨김) */}
          {isZoomedInFarm1 && !isPlantCheckView && (
            <div className="farm3d__farm1-controls-wrap">
              <Farm1ControlPanel
              led1={localLed1}
              led2={localLed2}
              led3={localLed3}
              onToggleLed={(id, next) => {
                if (id === 1) setLocalLed1(next);
                else if (id === 2) setLocalLed2(next);
                else setLocalLed3(next);
                toggleEquipmentStatus(id, next ? 'ON' : 'OFF');
                equipmentApi.control(id, next ? 'ON' : 'OFF').catch(console.error);
              }}
              onCheckPlants={() => {
                setIsPlantCheckView(true);
                animRef.current = { toPos: PLANT_CHECK_POS.clone(), toTarget: PLANT_CHECK_TARGET.clone() };
              }}
            />
            </div>
          )}

          {/* 팜1 진입뷰: FarmStatusPanel이 위에서 처리 */}

          {/* 팜2 비활성 토스트 */}
          {farm2Disabled && (
            <div className="farm3d__farm2-toast">
              <span className="farm3d__farm2-toast-icon">🚧</span>
              <div className="farm3d__farm2-toast-body">
                <span className="farm3d__farm2-toast-title">팜 2 비활성</span>
                <span className="farm3d__farm2-toast-desc">현재 운영 준비 중입니다.</span>
              </div>
            </div>
          )}

          {/* 식물상태확인 뷰 — AI 분석 결과 패널 */}
          {isPlantCheckView && <PlantStatusPanel />}

          <div className="farm3d__hint">
            <span className="farm3d__hint-key">드래그</span> 회전
            <span className="farm3d__hint-sep">·</span>
            <span className="farm3d__hint-key">스크롤</span> 확대/축소
          </div>
        </div>
      )}
    </div>
  );
}
