import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DoubleSide,
  Mesh,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Cpu } from 'lucide-react';
import './FarmModel3D.css';

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
  useFrame(() => {
    if (ctrlRef.current) {
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
    ctrl.target.set(18.30, 8.52, -5.22);
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
// World → screen position tracker for overlay button
// ────────────────────────────────────────────────────────
const LABEL_WORLD = new Vector3(18.3, 15, -5.22);

function ButtonTracker({
  canvasSize,
  onProject,
}: {
  canvasSize: { w: number; h: number };
  onProject: (x: number, y: number, visible: boolean) => void;
}) {
  const { camera } = useThree();
  useFrame(() => {
    const ndc = LABEL_WORLD.clone().project(camera);
    const visible = ndc.z < 1;
    const x = (ndc.x * 0.5 + 0.5) * canvasSize.w;
    const y = (-ndc.y * 0.5 + 0.5) * canvasSize.h;
    onProject(x, y, visible);
  });
  return null;
}

// ────────────────────────────────────────────────────────
// Ground plane
// ────────────────────────────────────────────────────────
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[18, -0.05, -5]} receiveShadow>
      <planeGeometry args={[160, 160]} />
      <meshStandardMaterial color="#c8d5b9" roughness={0.95} metalness={0} />
    </mesh>
  );
}

// ────────────────────────────────────────────────────────
// GLTF Model loader (auto-fit camera near/far)
// ────────────────────────────────────────────────────────
function GltfModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url) as any;
  const { camera } = useThree();

  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj: any) => {
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
    const sz = new Box3().setFromObject(cloned).getSize(new Vector3()).length();
    const cam = camera as PerspectiveCamera;
    cam.near = Math.max(0.001, sz * 0.001);
    cam.far  = sz * 100;
    cam.updateProjectionMatrix();
    return cloned;
  }, [gltf.scene, camera]);

  return <primitive object={scene} />;
}

// group ref로 visible 직접 제어 — Suspense 로드 후에도 확실히 반영
function ToggleModel({ url, visible }: { url: string; visible: boolean }) {
  const groupRef = useRef<any>(null);
  useEffect(() => {
    if (groupRef.current) groupRef.current.visible = visible;
  });  // 매 렌더마다 체크 (deps 없음)
  return (
    <group ref={groupRef}>
      <GltfModel url={url} />
    </group>
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
  canvasSize: { w: number; h: number };
  animRef: React.MutableRefObject<AnimTarget>;
  onCameraUpdate: (pos: Vector3, target: Vector3) => void;
  onButtonProject: (x: number, y: number, visible: boolean) => void;
}

function Scene({ led1On, led2On, led3On, showGreenhouse, canvasSize, animRef, onCameraUpdate, onButtonProject }: SceneProps) {
  const { scene } = useThree();

  useEffect(() => {
    scene.background = new Color(0xffffff);
    return () => { scene.background = null; };
  }, [scene]);

  return (
    <>
      <ambientLight intensity={1.8} />
      <directionalLight position={[5, 10, 5]}  intensity={3.0} castShadow />
      <directionalLight position={[-8, 4, -2]} intensity={1.5} />
      <directionalLight position={[0, -3, 8]}  intensity={1.0} />
      <Ground />
      <Suspense fallback={null}>
        {showGreenhouse && <GltfModel url="/3d-model/greenhouse.glb" />}
        <GltfModel url="/3d-model/pipeline.glb" />
        <ToggleModel url="/3d-model/light/light1-on.glb"  visible={led1On} />
        <ToggleModel url="/3d-model/light/light1-off.glb" visible={!led1On} />
        <ToggleModel url="/3d-model/light/light2-on.glb"  visible={led2On} />
        <ToggleModel url="/3d-model/light/light2-off.glb" visible={!led2On} />
        <ToggleModel url="/3d-model/light/light3-on.glb"  visible={led3On} />
        <ToggleModel url="/3d-model/light/light3-off.glb" visible={!led3On} />
      </Suspense>
      <CameraTracker onUpdate={onCameraUpdate} animRef={animRef} />
      <ButtonTracker canvasSize={canvasSize} onProject={onButtonProject} />
    </>
  );
}

// ────────────────────────────────────────────────────────
// LED status indicator
// ────────────────────────────────────────────────────────
interface LedIndicatorProps {
  label: string;
  on: boolean;
}

function LedIndicator({ label, on }: LedIndicatorProps) {
  return (
    <div className="farm3d__led">
      <span
        className="farm3d__led-dot"
        style={{ background: on ? '#FCD34D' : '#D1D5DB' }}
      />
      <span
        className="farm3d__led-label"
        style={{ color: on ? '#92400E' : '#9CA3AF' }}
      >
        {label}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────
export interface FarmModel3DProps {
  /** LED 상태. 외부에서 주입하지 않으면 모두 OFF */
  led1On?: boolean;
  led2On?: boolean;
  led3On?: boolean;
}

const OVERVIEW_POS    = new Vector3(56.44, 15.64, -33.48);
const OVERVIEW_TARGET = new Vector3(18.30,  8.52,  -5.22);
const ZOOM_POS        = new Vector3(34.2,  11.5,  -17.0);

export default function FarmModel3D({ led1On = false, led2On = false, led3On = false }: FarmModel3DProps) {
  const wrapRef    = useRef<HTMLDivElement>(null);
  const btnElemRef = useRef<HTMLButtonElement>(null);
  const animRef    = useRef<AnimTarget>(null);

  const [size, setSize]               = useState({ w: 0, h: 0 });
  const [showGreenhouse, setShowGreenhouse] = useState(true);
  const [camInfo, setCamInfo] = useState<{ pos: Vector3; target: Vector3 } | null>(null);

  const fmtVec = (v: Vector3) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

  const handleCameraUpdate = (pos: Vector3, target: Vector3) => { setCamInfo({ pos, target }); };

  const handleButtonProject = (x: number, y: number, visible: boolean) => {
    const el = btnElemRef.current;
    if (!el) return;
    el.style.display = visible ? 'flex' : 'none';
    el.style.left    = `${x}px`;
    el.style.top     = `${y}px`;
  };

  const handleSmartfarm1Click = () => {
    setShowGreenhouse(false);
    animRef.current = { toPos: ZOOM_POS.clone(), toTarget: OVERVIEW_TARGET.clone() };
  };

  const handleBackClick = () => {
    setShowGreenhouse(true);
    animRef.current = { toPos: OVERVIEW_POS.clone(), toTarget: OVERVIEW_TARGET.clone() };
  };

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
          <Cpu size={16} color="#374151" />
          <span className="farm3d__title">3D 스마트팜 모델</span>
        </div>
        <div className="farm3d__leds">
          <LedIndicator label="LED 1" on={led1On} />
          <LedIndicator label="LED 2" on={led2On} />
          <LedIndicator label="LED 3" on={led3On} />
        </div>
      </div>

      {/* Canvas 컨테이너 */}
      <div ref={wrapRef} className="farm3d__canvas-wrap">
        {size.w > 0 && size.h > 0 && (
          <Canvas
            camera={{ position: [56.44, 15.64, -33.48], fov: 45, near: 0.001, far: 10000 }}
            style={{ width: size.w, height: size.h, display: 'block' }}
            gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
            resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
          >
            <Scene
              led1On={led1On}
              led2On={led2On}
              led3On={led3On}
              showGreenhouse={showGreenhouse}
              canvasSize={size}
              animRef={animRef}
              onCameraUpdate={handleCameraUpdate}
              onButtonProject={handleButtonProject}
            />
          </Canvas>
        )}

        {/* 카메라 좌표 디버거 */}
        {camInfo && (
          <div className="farm3d__cam-debug">
            <span>📷 pos&nbsp;&nbsp;{fmtVec(camInfo.pos)}</span>
            <span>🎯 target {fmtVec(camInfo.target)}</span>
          </div>
        )}

        {/* 스마트팜1 월드 레이블 버튼 */}
        <button
          ref={btnElemRef}
          className={`farm3d__label-btn${!showGreenhouse ? ' farm3d__label-btn--active' : ''}`}
          style={{ display: 'none', left: 0, top: 0 }}
          onClick={showGreenhouse ? handleSmartfarm1Click : undefined}
        >
          스마트팜1
        </button>

        {/* 전체보기 복귀 버튼 */}
        {!showGreenhouse && (
          <button className="farm3d__back-btn" onClick={handleBackClick}>
            ← 전체보기
          </button>
        )}

        <div className="farm3d__hint">
          드래그하여 회전 · 스크롤하여 확대/축소
        </div>
      </div>
    </div>
  );
}
