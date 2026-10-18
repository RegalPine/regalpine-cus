/**
 * CUS-IMPLEMENTATION-03 §5 / CUS-UX-02：React Three Fiber 3D 色彩空间渲染器。
 * UX-02 §25：默认 Orthographic 投影（色彩空间分析需要几何稳定性）。
 * UX-02 §5–§8：Volume 点云渲染（uniform + adaptive 采样，由宿主注入）。
 * UX-02 §18–§19：射线 + Volume/Slice 相交拾取（连续坐标，非最近采样点）。
 * UX-02 §29：3D 中显示当前切片平面。
 *
 * 使用 React Three Fiber 声明式 API，提供更好的 React 集成和可维护性。
 */
import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { OKLCH, RGBSpace, V2Color, Oklab, SliceDefinition } from "@cus/core";
import {
  rayVolumeIntersect,
  raySliceIntersect,
  sliceToPlane,
  oklabToOklch,
  OKLAB_BOUNDS,
} from "@cus/core";

type Point3 = [number, number, number];

export interface GamutMeshData {
  triangles: [Point3, Point3, Point3][];
  target: RGBSpace;
}

export interface ColorPointData3D {
  key: string;
  color: V2Color;
  designPos: Point3;
  mappedPos: Point3;
  designColor: string;
  mappedColor: string;
  sectionDistant: boolean;
}

export interface PaletteTrail3D {
  family: string;
  points: Point3[];
}

export interface ColorSpace3DProps {
  gamutMeshes: GamutMeshData[];
  colorPoints: ColorPointData3D[];
  dirtyDots: { key: string; pos: Point3 }[];
  paletteTrails: PaletteTrail3D[];
  sectionGuide: Point3[] | null;
  candidatePos: Point3 | null;
  candidateColor: string;
  model: string;
  layers: {
    hueRing: boolean;
    lightnessGrid: boolean;
    gamutBoundary: boolean;
    dirtyZone: boolean;
    paletteTrail: boolean;
    contrastRef: boolean;
  };
  surfaces: Record<string, boolean>;
  crossSection: boolean;
  rotation: { yaw: number; pitch: number };
  zoom: number;
  pan: { x: number; y: number };
  onSelect: (name: string, color: V2Color) => void;
  haloKeys: Set<string>;
  /** UX-02 §25：投影模式，默认 ORTHOGRAPHIC。 */
  projection?: "ORTHOGRAPHIC" | "PERSPECTIVE";
  /** UX-02 §5–§8：Volume 点云（pos 由宿主用 position() 预计算，lab 为原始 OKLab）。 */
  volumePoints?: {
    pos: Point3;
    lab: Oklab;
    displayColor: string;
    gamut: "IN_GAMUT" | "NEAR_BOUNDARY" | "OUT_OF_GAMUT";
    dirty: "CLEAR" | "WARNING" | "DIRTY";
  }[];
  /** UX-02 §29：当前切片定义（3D 中显示切片平面）。 */
  slice?: SliceDefinition | null;
  /** UX-02 §18–§19：Volume/切片拾取回调（返回连续 OKLab 坐标）。 */
  onVolumePick?: (lab: Oklab, oklch: { l: number; c: number; h: number | null }) => void;
  /** 显示颜色点标签（key 名称） */
  showLabels?: boolean;
  /** 显示 Max Chroma 标注 */
  showMaxChroma?: boolean;
}

/**
 * 主组件：使用 React Three Fiber Canvas 包装 3D 场景
 */
export function ColorSpace3D(props: ColorSpace3DProps) {
  const {
    projection = "ORTHOGRAPHIC",
    zoom = 1,
    rotation,
    pan,
  } = props;

  // 计算相机位置
  const dist = 2.5 / zoom;
  const { yaw, pitch } = rotation;
  const cx = dist * Math.sin(yaw) * Math.cos(pitch);
  const cy = dist * Math.sin(pitch);
  const cz = dist * Math.cos(yaw) * Math.cos(pitch);
  const cameraPosition: [number, number, number] = [cx, cy, cz];
  const target: [number, number, number] = [pan.x * 0.002, -pan.y * 0.002, 0];

  return (
    <div style={{ position: "relative", width: "100%", height: 620 }}>
      <Canvas
        orthographic={projection === "ORTHOGRAPHIC"}
        camera={{
          position: cameraPosition,
          zoom: projection === "ORTHOGRAPHIC" ? zoom * 150 : undefined,
          fov: 50,
          near: 0.01,
          far: 100,
        }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "#13151a" }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
        }}
      >
        <SceneContent {...props} target={target} />
      </Canvas>
    </div>
  );
}

/**
 * 场景内容组件
 */
function SceneContent({
  gamutMeshes,
  colorPoints,
  dirtyDots,
  paletteTrails,
  sectionGuide,
  candidatePos,
  candidateColor,
  model,
  layers,
  surfaces,
  crossSection,
  onSelect,
  haloKeys,
  volumePoints,
  slice,
  onVolumePick,
  showLabels,
  showMaxChroma,
  target,
}: ColorSpace3DProps & { target: [number, number, number] }) {
  const controlsRef = useRef<any>(null);

  // 更新 OrbitControls target
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(target[0], target[1], target[2]);
      controlsRef.current.update();
    }
  }, [target]);

  // 点击处理
  const handleClick = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    
    // 检查是否点击了色点
    if (event.object.userData.type === "colorPoint") {
      const index = event.object.userData.index;
      if (index !== undefined && colorPoints[index]) {
        const pt = colorPoints[index];
        onSelect(pt.key, pt.color);
        return;
      }
    }

    // UX-02 §18–§19：未命中色点时，用射线 + Volume/Slice 相交产生连续 OKLab 坐标。
    if (onVolumePick && model === "oklab" && event.ray) {
      const lab = pickOklabFromRay(event.ray, slice);
      if (lab) {
        onVolumePick(lab, oklabToOklch(lab));
      }
    }
  };

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.1}
        minDistance={0.5}
        maxDistance={5}
        makeDefault
      />

      {/* 场景点击背景 */}
      <mesh onClick={handleClick} visible={false}>
        <sphereGeometry args={[10, 8, 8]} />
        <meshBasicMaterial side={THREE.BackSide} />
      </mesh>

      {/* 色域边界网格 */}
      {layers.gamutBoundary && gamutMeshes.map((mesh, i) => 
        surfaces[mesh.target] && (
          <GamutMesh key={i} meshData={mesh} />
        )
      )}

      {/* 颜色点 */}
      <ColorPoints
        colorPoints={colorPoints}
        haloKeys={haloKeys}
        layers={layers}
        onSelect={onSelect}
        showLabels={showLabels}
      />

      {/* 纬度环（OKLab 模型） */}
      {(model === "oklab" || model === "lab") && layers.lightnessGrid && <LatitudeRings />}

      {/* Max Chroma 标注 */}
      {showMaxChroma && (
        <Html position={[0.25, 0.12, 0]} center>
          <span style={{
            fontSize: 10,
            color: "#b0aec8",
            whiteSpace: "nowrap",
            fontFamily: "JetBrains Mono",
            background: "rgba(15,17,24,0.7)",
            padding: "1px 4px",
            borderRadius: 3,
          }}>
            Max Chroma C: 0.32
          </span>
        </Html>
      )}

      {/* Dirty Zone 点 */}
      {layers.dirtyZone && dirtyDots.length > 0 && (
        <DirtyDots dirtyDots={dirtyDots} />
      )}

      {/* Palette 轨迹 */}
      {layers.paletteTrail && paletteTrails.map((trail) => (
        <PaletteTrail key={trail.family} trail={trail} />
      ))}

      {/* 截面导向线 */}
      {crossSection && sectionGuide && sectionGuide.length >= 2 && (
        <SectionGuide points={sectionGuide} />
      )}

      {/* Volume 点云 */}
      {volumePoints && volumePoints.length > 0 && (
        <VolumePoints points={volumePoints} />
      )}

      {/* 切片平面 */}
      {slice && <SlicePlane slice={slice} />}

      {/* 候选标记 */}
      {candidatePos && (
        <CandidateMarker position={candidatePos} color={candidateColor} />
      )}

      {/* 坐标轴和标签 */}
      <Axes model={model} layers={layers} />
    </>
  );
}

/**
 * 色域边界网格组件
 */
function GamutMesh({ meshData }: { meshData: GamutMeshData }) {
  const isP3 = meshData.target === "display-p3";
  const color = isP3 ? 0xc66b25 : 0x287db0;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const c = new THREE.Color(color);

    for (const tri of meshData.triangles) {
      for (const pt of tri) {
        positions.push(pt[0], pt[1], pt[2]);
        colors.push(c.r, c.g, c.b);
      }
    }

    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [meshData, color]);

  return (
    <group>
      {/* 实体面 */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.035}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* 线框叠加 */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          vertexColors
          wireframe
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * 颜色点组件（使用 InstancedMesh 优化性能）
 */
function ColorPoints({
  colorPoints,
  haloKeys,
  layers,
  onSelect,
  showLabels,
}: {
  colorPoints: ColorPointData3D[];
  haloKeys: Set<string>;
  layers: ColorSpace3DProps["layers"];
  onSelect: (name: string, color: V2Color) => void;
  showLabels?: boolean;
}) {
  const designMeshRef = useRef<THREE.InstancedMesh>(null);
  const mappedMeshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!designMeshRef.current || !mappedMeshRef.current) return;

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();

    colorPoints.forEach((pt, i) => {
      // 设计点（球体）
      dummy.position.set(...pt.designPos);
      dummy.updateMatrix();
      designMeshRef.current!.setMatrixAt(i, dummy.matrix);
      tmpColor.set(pt.designColor);
      designMeshRef.current!.setColorAt(i, tmpColor);

      // 映射点（方块）
      dummy.position.set(...pt.mappedPos);
      dummy.updateMatrix();
      mappedMeshRef.current!.setMatrixAt(i, dummy.matrix);
      tmpColor.set(pt.mappedColor);
      mappedMeshRef.current!.setColorAt(i, tmpColor);
    });

    designMeshRef.current.instanceMatrix.needsUpdate = true;
    if (designMeshRef.current.instanceColor) {
      designMeshRef.current.instanceColor.needsUpdate = true;
    }
    mappedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (mappedMeshRef.current.instanceColor) {
      mappedMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [colorPoints]);

  if (colorPoints.length === 0) return null;

  return (
    <group>
      {/* 设计源点（球体） */}
      <instancedMesh
        ref={designMeshRef}
        args={[undefined, undefined, colorPoints.length]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && colorPoints[e.instanceId]) {
            const pt = colorPoints[e.instanceId];
            onSelect(pt.key, pt.color);
          }
        }}
      >
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshBasicMaterial color={0xffffff} />
      </instancedMesh>

      {/* 映射点（方块） */}
      <instancedMesh
        ref={mappedMeshRef}
        args={[undefined, undefined, colorPoints.length]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && colorPoints[e.instanceId]) {
            const pt = colorPoints[e.instanceId];
            onSelect(pt.key, pt.color);
          }
        }}
      >
        <boxGeometry args={[0.018, 0.018, 0.018]} />
        <meshBasicMaterial color={0xffffff} />
      </instancedMesh>

      {/* 连接线（设计 → 映射） */}
      <ConnectionLines colorPoints={colorPoints} />

      {/* 颜色点标签 */}
      {showLabels && colorPoints.map((pt) => {
        // 只为最关键的品牌色点显示标签，避免重叠
        const [family, step] = pt.key.split(".");
        const isKeyPoint =
          (family === "primary" && step === "600") ||
          (family === "secondary" && step === "400") ||
          (family === "accent" && step === "500") ||
          (family === "error" && step === "500");
        if (!isKeyPoint) return null;
        return (
          <Html key={`label-${pt.key}`} position={[pt.designPos[0], pt.designPos[1] + 0.04, pt.designPos[2]]} center>
            <span style={{
              fontSize: 10,
              color: "#e0dff0",
              whiteSpace: "nowrap",
              fontFamily: "JetBrains Mono",
              background: "rgba(15,17,24,0.85)",
              padding: "2px 6px",
              borderRadius: 4,
              border: "1px solid rgba(128,131,255,0.4)",
              letterSpacing: "0.02em",
            }}>
              {pt.key}
            </span>
          </Html>
        );
      })}

      {/* 对比参考光环 */}
      {layers.contrastRef && colorPoints.map((pt) =>
        haloKeys.has(pt.key) && (
          <mesh key={pt.key} position={pt.designPos}>
            <ringGeometry args={[0.025, 0.03, 24]} />
            <meshBasicMaterial
              color={0xb7791f}
              side={THREE.DoubleSide}
              transparent
              opacity={0.8}
            />
          </mesh>
        )
      )}
    </group>
  );
}

/**
 * 连接线组件
 */
function ConnectionLines({ colorPoints }: { colorPoints: ColorPointData3D[] }) {
  const lines = useMemo(() => {
    return colorPoints.map((pt) => ({
      points: [pt.designPos, pt.mappedPos] as [Point3, Point3],
    }));
  }, [colorPoints]);

  return (
    <group>
      {lines.map((line, i) => (
        <Line
          key={i}
          points={[line.points[0], line.points[1]]}
          color="#666666"
          lineWidth={1}
          transparent
          opacity={0.5}
          dashed
          dashSize={0.015}
          gapSize={0.01}
        />
      ))}
    </group>
  );
}

/**
 * Dirty Zone 点组件
 */
function DirtyDots({ dirtyDots }: { dirtyDots: { key: string; pos: Point3 }[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!meshRef.current) return;
    const d = new THREE.Object3D();
    dirtyDots.forEach((dot, i) => {
      d.position.set(...dot.pos);
      d.updateMatrix();
      meshRef.current!.setMatrixAt(i, d.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [dirtyDots]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, dirtyDots.length]}>
      <sphereGeometry args={[0.006, 6, 6]} />
      <meshBasicMaterial color={0x8a5a12} transparent opacity={0.55} />
    </instancedMesh>
  );
}

/**
 * Palette 轨迹线组件
 */
function PaletteTrail({ trail }: { trail: PaletteTrail3D }) {
  if (trail.points.length < 2) return null;

  return (
    <Line
      points={trail.points}
      color="#666666"
      lineWidth={1}
      transparent
      opacity={0.55}
    />
  );
}

/**
 * 截面导向线组件
 */
function SectionGuide({ points }: { points: Point3[] }) {
  return (
    <Line
      points={points}
      color="#333333"
      lineWidth={1.6}
      transparent
      opacity={0.85}
    />
  );
}

/**
 * Volume 点云组件
 */
function VolumePoints({ points }: { points: NonNullable<ColorSpace3DProps["volumePoints"]> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!meshRef.current) return;
    const vd = new THREE.Object3D();
    const vc = new THREE.Color();

    points.forEach((vp, i) => {
      vd.position.set(vp.pos[0], vp.pos[1], vp.pos[2]);
      const out = vp.gamut === "OUT_OF_GAMUT";
      vd.scale.setScalar(out ? 0.7 : 1);
      vd.updateMatrix();
      meshRef.current!.setMatrixAt(i, vd.matrix);
      
      vc.set(vp.displayColor);
      if (out) vc.multiplyScalar(0.55);
      if (vp.dirty === "DIRTY") vc.lerp(new THREE.Color(0x8a5a12), 0.35);
      meshRef.current!.setColorAt(i, vc);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [points]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, points.length]}>
      <sphereGeometry args={[0.008, 6, 6]} />
      <meshBasicMaterial color={0xffffff} />
    </instancedMesh>
  );
}

/**
 * 切片平面组件
 */
function SlicePlane({ slice }: { slice: SliceDefinition }) {
  const mesh = useMemo(() => buildSlicePlaneMesh(slice), [slice]);
  if (!mesh) return null;

  return <primitive object={mesh} />;
}

/**
 * 候选标记组件
 */
function CandidateMarker({ position, color }: { position: Point3; color: string }) {
  const torusRef = useRef<THREE.Mesh>(null);

  // 动画效果
  useFrame((state) => {
    if (torusRef.current) {
      torusRef.current.rotation.x = state.clock.elapsedTime * 0.5;
      torusRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <group position={position}>
      {/* 虚线环 */}
      <mesh ref={torusRef}>
        <torusGeometry args={[0.035, 0.003, 8, 32]} />
        <meshBasicMaterial color={0x202631} transparent opacity={0.8} />
      </mesh>
      {/* 实心球 */}
      <mesh>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

/**
 * 纬度环组件（OKLab 模型）— 在固定 L 值处绘制水平圆环并标注。
 */
function LatitudeRings() {
  const rings = [
    { l: 0.75, label: "L=0.75", z: 0.25 },
    { l: 0.50, label: "L=0.50 (Midtone)", z: 0 },
    { l: 0.25, label: "L=0.25", z: -0.25 },
    { l: 0.00, label: "L=0.00 (Black)", z: -0.5 },
  ];
  const radius = 0.30;

  return (
    <group>
      {rings.map(({ l, label, z }) => {
        const pts: Point3[] = [];
        for (let i = 0; i <= 72; i++) {
          const angle = (i / 72) * Math.PI * 2;
          pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius, z]);
        }
        return (
          <group key={l}>
            <Line
              points={pts}
              color="#8083ff"
              lineWidth={1.2}
              transparent
              opacity={0.45}
              dashed
              dashSize={0.025}
              gapSize={0.015}
            />
            <Html position={[-radius - 0.08, 0, z]} center>
              <span style={{
                fontSize: 10,
                color: "#b0aec8",
                whiteSpace: "nowrap",
                fontFamily: "JetBrains Mono",
                background: "rgba(15,17,24,0.7)",
                padding: "1px 4px",
                borderRadius: 3,
              }}>
                {label}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/**
 * 坐标轴组件
 */
function Axes({ model, layers }: { model: string; layers: ColorSpace3DProps["layers"] }) {
  const axisColor = "#666680";

  if (model === "oklab" || model === "lab") {
    const axes: { name: string; end: Point3 }[] =
      model === "lab"
        ? [
            { name: "a*", end: [0.7, 0, 0] },
            { name: "b*", end: [0, 0.7, 0] },
            { name: "L*", end: [0, 0, 0.55] },
          ]
        : [
            { name: "a", end: [0.7, 0, 0] },
            { name: "b", end: [0, 0.7, 0] },
            { name: "L", end: [0, 0, 0.55] },
          ];

    return (
      <group>
        {axes.map((axis) => {
          if (!layers.lightnessGrid && (axis.name === "L" || axis.name === "L*")) {
            return null;
          }
          return (
            <group key={axis.name}>
              <Line
                points={[[0, 0, 0], axis.end]}
                color={axisColor}
                lineWidth={1}
              />
              <Html position={axis.end} center>
                <span style={{ fontSize: 11, color: "#b0aec8", whiteSpace: "nowrap", background: "rgba(15,17,24,0.7)", padding: "1px 3px", borderRadius: 2 }}>
                  {axis.name}
                </span>
              </Html>
            </group>
          );
        })}
      </group>
    );
  }

  // OKLCH / LCH: 色相环 + 明度网格
  const isCie = model === "lch";

  return (
    <group>
      {/* 明度网格圆 */}
      {layers.lightnessGrid && [0, 0.25, 0.5, 0.75, 1].map((l) => {
        const pts: Point3[] = [];
        for (let i = 0; i <= 72; i++) {
          const h = i * 5;
          const oklch = isCie
            ? cieLchToPos(l * 100, 50, h, model)
            : { l, c: 0.3, h };
          pts.push(positionGeneric(oklch as OKLCH, model as any));
        }
        return (
          <Line
            key={l}
            points={pts}
            color={axisColor}
            lineWidth={1}
            transparent
            opacity={0.35}
          />
        );
      })}

      {/* 色相环径向线 */}
      {layers.hueRing && [0, 60, 120, 180, 240, 300].map((h) => {
        const startOk = isCie
          ? cieLchToPos(0, 50, h, model)
          : { l: 0, c: 0.3, h };
        const endOk = isCie
          ? cieLchToPos(100, 50, h, model)
          : { l: 1, c: 0.3, h };
        const pts: Point3[] = [
          [0, 0, 0],
          positionGeneric(startOk as OKLCH, model as any),
          positionGeneric(endOk as OKLCH, model as any),
        ];
        
        const labelOk = isCie
          ? cieLchToPos(0, 57.5, h, model)
          : { l: 0, c: 0.32, h };
        const labelPos = positionGeneric(labelOk as OKLCH, model as any);

        return (
          <group key={h}>
            <Line
              points={pts}
              color={axisColor}
              lineWidth={1}
              transparent
              opacity={0.35}
            />
            <Html position={labelPos} center>
              <span style={{ fontSize: 11, color: "#b0aec8", whiteSpace: "nowrap", background: "rgba(15,17,24,0.7)", padding: "1px 3px", borderRadius: 2 }}>
                {h}°
              </span>
            </Html>
          </group>
        );
      })}

      {/* 模型说明标签 */}
      <Html position={[-0.3, 0.4, 0]} center>
        <span style={{ fontSize: 11, color: "#b0aec8", whiteSpace: "nowrap", background: "rgba(15,17,24,0.7)", padding: "1px 4px", borderRadius: 3 }}>
          {model === "oklch" ? "L ↑ · C 径向 · H 环绕" : "L* ↑ · C* 径向 · h° 环绕"}
        </span>
      </Html>
    </group>
  );
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/**
 * UX-02 §18–§19：将世界空间射线转换为 OKLab 空间后与 Volume / Slice 平面求交。
 */
function pickOklabFromRay(
  ray: THREE.Ray,
  slice: SliceDefinition | null | undefined,
): Oklab | null {
  const o = ray.origin;
  const d = ray.direction;
  const ray14 = {
    origin: [o.x / 2, o.z + 0.5, o.y / 2] as [number, number, number],
    direction: [d.x / 2, d.z, d.y / 2] as [number, number, number],
  };
  if (slice) {
    const hit = raySliceIntersect(ray14, sliceToPlane(slice));
    if (hit) return hit;
  }
  return rayVolumeIntersect(ray14, OKLAB_BOUNDS);
}

/**
 * UX-02 §29/§30：构造切片平面的世界坐标网格。
 */
function buildSlicePlaneMesh(slice: SliceDefinition): THREE.Mesh | null {
  const A = OKLAB_BOUNDS.a[1] * 2;
  const B = OKLAB_BOUNDS.b[1] * 2;
  const L0 = OKLAB_BOUNDS.l[0] - 0.5;
  const L1 = OKLAB_BOUNDS.l[1] - 0.5;
  let corners: [number, number, number][];

  if (slice.axis === "L") {
    const z = slice.value - 0.5;
    corners = [
      [-A, -B, z],
      [A, -B, z],
      [A, B, z],
      [-A, B, z],
    ];
  } else if (slice.axis === "a") {
    const x = slice.value * 2;
    corners = [
      [x, -B, L0],
      [x, B, L0],
      [x, B, L1],
      [x, -B, L1],
    ];
  } else {
    const y = slice.value * 2;
    corners = [
      [-A, y, L0],
      [A, y, L0],
      [A, y, L1],
      [-A, y, L1],
    ];
  }

  const positions: number[] = [];
  for (const idx of [0, 1, 2, 0, 2, 3]) {
    const c = corners[idx];
    positions.push(c[0], c[1], c[2]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.MeshBasicMaterial({
    color: 0x202631,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);

  // 平面边框
  const edgeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...corners[0]),
    new THREE.Vector3(...corners[1]),
    new THREE.Vector3(...corners[2]),
    new THREE.Vector3(...corners[3]),
    new THREE.Vector3(...corners[0]),
  ]);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x202631,
    transparent: true,
    opacity: 0.45,
  });
  const edges = new THREE.Line(edgeGeo, edgeMat);
  mesh.add(edges);

  return mesh;
}

/**
 * CIELCh → 3D position for OKLCH/LCH views.
 */
function cieLchToPos(l: number, c: number, h: number, model: string): Point3 {
  const rad = (h * Math.PI) / 180;
  if (model === "lch") {
    return [
      (c * Math.cos(rad)) / 125,
      (c * Math.sin(rad)) / 125,
      l / 100 - 0.5,
    ];
  }
  return [
    (c / 100) * Math.cos(rad) * 2,
    (c / 100) * Math.sin(rad) * 2,
    l / 100 - 0.5,
  ];
}

/** Generic position for OKLCH-like coordinates. */
function positionGeneric(color: OKLCH, model: string): Point3 {
  if (model === "lch") {
    const rad = ((color.h ?? 0) * Math.PI) / 180;
    return [
      (color.c * Math.cos(rad)) / 125,
      (color.c * Math.sin(rad)) / 125,
      color.l / 100 - 0.5,
    ];
  }
  if (model === "oklch") {
    const rad = ((color.h ?? 0) * Math.PI) / 180;
    return [
      color.c * Math.cos(rad) * 2,
      color.c * Math.sin(rad) * 2,
      color.l - 0.5,
    ];
  }
  return [color.c * 2, 0, color.l - 0.5];
}
