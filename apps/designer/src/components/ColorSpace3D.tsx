/**
 * CUS-IMPLEMENTATION-03 §5 / CUS-UX-02：WebGL 3D 色彩空间渲染器（three.js）。
 * UX-02 §25：默认 Orthographic 投影（色彩空间分析需要几何稳定性）。
 * UX-02 §5–§8：Volume 点云渲染（uniform + adaptive 采样，由宿主注入）。
 * UX-02 §18–§19：射线 + Volume/Slice 相交拾取（连续坐标，非最近采样点）。
 * UX-02 §29：3D 中显示当前切片平面。
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
}

export function ColorSpace3D({
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
  rotation,
  zoom,
  pan,
  onSelect,
  haloKeys,
  projection = "ORTHOGRAPHIC",
  volumePoints,
  slice,
  onVolumePick,
}: ColorSpace3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // UX-02 §25：相机支持 Orthographic（默认）与 Perspective 两种投影。
  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const dataGroupRef = useRef<THREE.Group | null>(null);
  const labelsGroupRef = useRef<THREE.Group | null>(null);
  const designMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const mappedMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const volumeMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onVolumePickRef = useRef(onVolumePick);
  onVolumePickRef.current = onVolumePick;
  const colorPointsRef = useRef(colorPoints);
  colorPointsRef.current = colorPoints;
  const modelRef = useRef(model);
  modelRef.current = model;
  const sliceRef = useRef(slice);
  sliceRef.current = slice;
  const animIdRef = useRef(0);
  const labelContainerRef = useRef<HTMLDivElement | null>(null);
  const labelDataRef = useRef<
    { el: HTMLSpanElement; pos: THREE.Vector3 }[]
  >([]);

  // ── Effect 1: Scene / Camera / Renderer / Controls (re-create on zoom) ────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 700;
    const h = container.clientHeight || 490;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f6f7f9");
    sceneRef.current = scene;

    // Camera
    const dist = 2.5 / zoom;
    const { yaw, pitch } = rotation;
    const cx = dist * Math.sin(yaw) * Math.cos(pitch);
    const cy = dist * Math.sin(pitch);
    const cz = dist * Math.cos(yaw) * Math.cos(pitch);
    const target = new THREE.Vector3(pan.x * 0.002, -pan.y * 0.002, 0);
    // UX-02 §25：默认 Orthographic（色彩空间分析需要几何稳定性，而非视觉透视效果）。
    let camera: THREE.Camera;
    if (projection === "PERSPECTIVE") {
      const pc = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
      pc.position.set(cx, cy, cz);
      pc.lookAt(target);
      camera = pc;
    } else {
      const frustum = 1.4 / zoom;
      const aspect = w / h;
      const oc = new THREE.OrthographicCamera(
        -frustum * aspect,
        frustum * aspect,
        frustum,
        -frustum,
        0.01,
        100,
      );
      oc.position.set(cx, cy, cz);
      oc.lookAt(target);
      camera = oc;
    }
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 0.5;
    controls.maxDistance = 5;
    controls.target.set(pan.x * 0.002, -pan.y * 0.002, 0);
    controls.update();
    controlsRef.current = controls;

    // Data group
    const dataGroup = new THREE.Group();
    scene.add(dataGroup);
    dataGroupRef.current = dataGroup;

    // Labels group (billboard toward camera)
    const labelsGroup = new THREE.Group();
    scene.add(labelsGroup);
    labelsGroupRef.current = labelsGroup;

    // HTML overlay for text labels
    const labelContainer = document.createElement("div");
    labelContainer.className = "space-3d-labels";
    labelContainer.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;";
    container.appendChild(labelContainer);
    labelContainerRef.current = labelContainer;
    // Store label data on container so animate loop can access it
    const labelItems: { el: HTMLSpanElement; pos: THREE.Vector3 }[] = [];
    (labelContainer as any).__cusLabels = labelItems;

    // Resize handler
    const onResize = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw > 0 && ch > 0) {
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = cw / ch;
          camera.updateProjectionMatrix();
        } else if (camera instanceof THREE.OrthographicCamera) {
          const frustum = 1.4 / zoom;
          const aspect = cw / ch;
          camera.left = -frustum * aspect;
          camera.right = frustum * aspect;
          camera.top = frustum;
          camera.bottom = -frustum;
          camera.updateProjectionMatrix();
        }
        renderer.setSize(cw, ch);
      }
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // Render loop
    const tmpQ = new THREE.Quaternion();
    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      controls.update();
      // Billboard labels toward camera
      if (labelsGroup.children.length > 0) {
        camera.getWorldQuaternion(tmpQ);
        for (const child of labelsGroup.children) {
          child.quaternion.copy(tmpQ);
        }
      }
      // Update HTML label positions
      const items = (labelContainer as any).__cusLabels as
        | { el: HTMLSpanElement; pos: THREE.Vector3 }[]
        | undefined;
      if (items) updateHtmlLabels(camera, labelContainer, items);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animIdRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      if (labelContainer.parentNode) {
        labelContainer.parentNode.removeChild(labelContainer);
      }
      labelContainerRef.current = null;
      labelDataRef.current = [];
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      dataGroupRef.current = null;
      labelsGroupRef.current = null;
    };
    // Re-create when zoom/rotation/pan/projection changes (camera position)
  }, [zoom, rotation.yaw, rotation.pitch, pan.x, pan.y, projection]);

  // ── Effect 2: Click handler (raycasting) ──────────────────────────────────
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const canvas = renderer.domElement;

    const onClick = (event: PointerEvent) => {
      const camera = cameraRef.current;
      if (!camera) return;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const pts = colorPointsRef.current;
      if (designMeshRef.current) {
        const hits = raycaster.intersectObject(designMeshRef.current);
        if (hits.length > 0 && hits[0].instanceId !== undefined) {
          const p = pts[hits[0].instanceId];
          if (p) onSelectRef.current(`${p.key}`, p.color);
          return;
        }
      }
      if (mappedMeshRef.current) {
        const hits = raycaster.intersectObject(mappedMeshRef.current);
        if (hits.length > 0 && hits[0].instanceId !== undefined) {
          const p = pts[hits[0].instanceId];
          if (p) onSelectRef.current(`${p.key}`, p.color);
          return;
        }
      }
      // UX-02 §18–§19：未命中色点时，用射线 + Volume/Slice 相交产生连续 OKLab 坐标。
      // 仅 OKLab 主 3D 空间支持（§2：OKLab 为三维几何主空间）；其他空间走色点拾取。
      if (onVolumePickRef.current && modelRef.current === "oklab") {
        const lab = pickOklabFromRay(raycaster.ray, sliceRef.current);
        if (lab) {
          onVolumePickRef.current(lab, oklabToOklch(lab));
        }
      }
    };
    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, []);

  // ── Effect 3: Build scene geometry ────────────────────────────────────────
  useEffect(() => {
    const group = dataGroupRef.current;
    const labelsGroup = labelsGroupRef.current;
    if (!group || !labelsGroup) return;

    // Cleanup previous
    for (const child of [...group.children]) {
      group.remove(child);
      disposeObject(child);
    }
    designMeshRef.current = null;
    mappedMeshRef.current = null;

    // Clear HTML labels
    if (labelContainerRef.current) {
      while (labelContainerRef.current.firstChild)
        labelContainerRef.current.removeChild(
          labelContainerRef.current.firstChild,
        );
    }
    labelDataRef.current = [];
    for (const child of [...labelsGroup.children]) {
      labelsGroup.remove(child);
    }

    // ── Gamut boundary meshes ───────────────────────────────────────────
    for (const mesh of gamutMeshes) {
      if (!layers.gamutBoundary || !surfaces[mesh.target]) continue;
      const isP3 = mesh.target === "display-p3";
      const color = isP3 ? 0xc66b25 : 0x287db0;
      const positions: number[] = [];
      const colors: number[] = [];
      const c = new THREE.Color(color);
      for (const tri of mesh.triangles) {
        for (const pt of tri) {
          positions.push(pt[0], pt[1], pt[2]);
          colors.push(c.r, c.g, c.b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.035,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(geo, mat));
      // Wireframe overlay
      const wireMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(geo.clone(), wireMat));
    }

    // ── Color points (InstancedMesh) ────────────────────────────────────
    if (colorPoints.length > 0) {
      // Design source → spheres
      const sphereGeo = new THREE.SphereGeometry(0.018, 12, 12);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const designMesh = new THREE.InstancedMesh(
        sphereGeo,
        sphereMat,
        colorPoints.length,
      );
      const dummy = new THREE.Object3D();
      const tmpColor = new THREE.Color();
      colorPoints.forEach((pt, i) => {
        dummy.position.set(...pt.designPos);
        dummy.updateMatrix();
        designMesh.setMatrixAt(i, dummy.matrix);
        tmpColor.set(pt.designColor);
        designMesh.setColorAt(i, tmpColor);
      });
      designMesh.instanceMatrix.needsUpdate = true;
      if (designMesh.instanceColor) designMesh.instanceColor.needsUpdate = true;
      group.add(designMesh);
      designMeshRef.current = designMesh;

      // Mapped → boxes
      const boxGeo = new THREE.BoxGeometry(0.018, 0.018, 0.018);
      const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mappedMesh = new THREE.InstancedMesh(
        boxGeo,
        boxMat,
        colorPoints.length,
      );
      colorPoints.forEach((pt, i) => {
        dummy.position.set(...pt.mappedPos);
        dummy.updateMatrix();
        mappedMesh.setMatrixAt(i, dummy.matrix);
        tmpColor.set(pt.mappedColor);
        mappedMesh.setColorAt(i, tmpColor);
      });
      mappedMesh.instanceMatrix.needsUpdate = true;
      if (mappedMesh.instanceColor) mappedMesh.instanceColor.needsUpdate = true;
      group.add(mappedMesh);
      mappedMeshRef.current = mappedMesh;

      // Dashed lines: design → mapped
      const linePositions: number[] = [];
      const lineColors: number[] = [];
      const gray = new THREE.Color("#666");
      for (const pt of colorPoints) {
        linePositions.push(...pt.designPos, ...pt.mappedPos);
        lineColors.push(gray.r, gray.g, gray.b, gray.r, gray.g, gray.b);
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(linePositions, 3),
      );
      lineGeo.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(lineColors, 3),
      );
      const lineMat = new THREE.LineDashedMaterial({
        vertexColors: true,
        dashSize: 0.015,
        gapSize: 0.01,
        transparent: true,
        opacity: 0.5,
      });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      lines.computeLineDistances();
      group.add(lines);

      // Contrast halos
      if (layers.contrastRef) {
        for (const pt of colorPoints) {
          if (!haloKeys.has(pt.key)) continue;
          const ringGeo = new THREE.RingGeometry(0.025, 0.03, 24);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xb7791f,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(...pt.designPos);
          group.add(ring);
        }
      }
    }

    // ── Dirty zone dots ─────────────────────────────────────────────────
    if (layers.dirtyZone && dirtyDots.length > 0) {
      const dotGeo = new THREE.SphereGeometry(0.006, 6, 6);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0x8a5a12,
        transparent: true,
        opacity: 0.55,
      });
      const dotMesh = new THREE.InstancedMesh(dotGeo, dotMat, dirtyDots.length);
      const d = new THREE.Object3D();
      dirtyDots.forEach((dot, i) => {
        d.position.set(...dot.pos);
        d.updateMatrix();
        dotMesh.setMatrixAt(i, d.matrix);
      });
      dotMesh.instanceMatrix.needsUpdate = true;
      group.add(dotMesh);
    }

    // ── Palette trail lines ─────────────────────────────────────────────
    if (layers.paletteTrail) {
      for (const trail of paletteTrails) {
        if (trail.points.length < 2) continue;
        const pts = trail.points.map(
          (p) => new THREE.Vector3(p[0], p[1], p[2]),
        );
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: 0x666666,
          transparent: true,
          opacity: 0.55,
        });
        group.add(new THREE.Line(geo, mat));
      }
    }

    // ── Section guide line ──────────────────────────────────────────────
    if (crossSection && sectionGuide && sectionGuide.length >= 2) {
      const pts = sectionGuide.map(
        (p) => new THREE.Vector3(p[0], p[1], p[2]),
      );
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.85,
        linewidth: 1.6,
      });
      group.add(new THREE.Line(geo, mat));
    }

    // ── UX-02 §5–§8：Volume 点云（InstancedMesh 批量渲染）─────────────────
    // 每个采样点以小球呈现；OUT_OF_GAMUT 使用 gamut visualization style（§50/§51），
    // 不伪装成合法颜色；DIRTY 点叠加暗色描边提示（§13 Dirty Zone Overlay）。
    if (volumePoints && volumePoints.length > 0) {
      const vGeo = new THREE.SphereGeometry(0.008, 6, 6);
      const vMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const vMesh = new THREE.InstancedMesh(vGeo, vMat, volumePoints.length);
      const vd = new THREE.Object3D();
      const vc = new THREE.Color();
      volumePoints.forEach((vp, i) => {
        vd.position.set(vp.pos[0], vp.pos[1], vp.pos[2]);
        // OUT_OF_GAMUT 点半透明以示“存在于感知空间但设备无法表达”（§35/§51）。
        const out = vp.gamut === "OUT_OF_GAMUT";
        vd.scale.setScalar(out ? 0.7 : 1);
        vd.updateMatrix();
        vMesh.setMatrixAt(i, vd.matrix);
        vc.set(vp.displayColor);
        if (out) vc.multiplyScalar(0.55); // gamut visualization style
        if (vp.dirty === "DIRTY") vc.lerp(new THREE.Color(0x8a5a12), 0.35);
        vMesh.setColorAt(i, vc);
      });
      vMesh.instanceMatrix.needsUpdate = true;
      if (vMesh.instanceColor) vMesh.instanceColor.needsUpdate = true;
      group.add(vMesh);
      volumeMeshRef.current = vMesh;
    }

    // ── UX-02 §29：Slice Plane（3D 中显示当前切片平面）──────────────────
    // 平面以半透明四边形呈现，法向与 §30 sliceToPlane 一致（世界坐标）。
    if (slice) {
      const planeMesh = buildSlicePlaneMesh(slice);
      if (planeMesh) group.add(planeMesh);
    }

    // ── Candidate marker ────────────────────────────────────────────────
    if (candidatePos) {
      // Dashed ring (torus)
      const torusGeo = new THREE.TorusGeometry(0.035, 0.003, 8, 32);
      const torusMat = new THREE.MeshBasicMaterial({
        color: 0x202631,
        transparent: true,
        opacity: 0.8,
      });
      const torus = new THREE.Mesh(torusGeo, torusMat);
      torus.position.set(...candidatePos);
      group.add(torus);
      // Solid sphere
      const sGeo = new THREE.SphereGeometry(0.016, 16, 16);
      const sMat = new THREE.MeshBasicMaterial({ color: candidateColor });
      const s = new THREE.Mesh(sGeo, sMat);
      s.position.set(...candidatePos);
      group.add(s);
    }

    // ── Axes ────────────────────────────────────────────────────────────
    const axisColor = 0x999999;
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

    if (model === "oklab" || model === "lab") {
      for (const axis of axes) {
        if (
          !layers.lightnessGrid &&
          (axis.name === "L" || axis.name === "L*")
        )
          continue;
        const pts = [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(...axis.end),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: axisColor });
        group.add(new THREE.Line(geo, mat));
        // HTML label at axis end
        addHtmlLabel(axis.name, new THREE.Vector3(...axis.end));
      }
    } else {
      // OKLCH / LCH: hue ring lines + lightness grid circles
      const isCie = model === "lch";
      // Lightness grid circles
      if (layers.lightnessGrid) {
        for (const l of [0, 0.25, 0.5, 0.75, 1]) {
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 72; i++) {
            const h = i * 5;
            const oklch = isCie
              ? cieLchToPos(l * 100, 50, h, model)
              : { l, c: 0.3, h };
            pts.push(
              new THREE.Vector3(
                ...positionGeneric(oklch as OKLCH, model as any),
              ),
            );
          }
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({
            color: axisColor,
            transparent: true,
            opacity: 0.35,
          });
          group.add(new THREE.Line(geo, mat));
        }
      }
      // Hue ring radial lines
      if (layers.hueRing) {
        for (const h of [0, 60, 120, 180, 240, 300]) {
          const pts: THREE.Vector3[] = [];
          const startOk = isCie
            ? cieLchToPos(0, 50, h, model)
            : { l: 0, c: 0.3, h };
          const endOk = isCie
            ? cieLchToPos(100, 50, h, model)
            : { l: 1, c: 0.3, h };
          pts.push(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(...positionGeneric(startOk as OKLCH, model as any)),
            new THREE.Vector3(...positionGeneric(endOk as OKLCH, model as any)),
          );
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({
            color: axisColor,
            transparent: true,
            opacity: 0.35,
          });
          group.add(new THREE.Line(geo, mat));
          // Label
          const labelOk = isCie
            ? cieLchToPos(0, 57.5, h, model)
            : { l: 0, c: 0.32, h };
          addHtmlLabel(
            `${h}°`,
            new THREE.Vector3(
              ...positionGeneric(labelOk as OKLCH, model as any),
            ),
          );
        }
      }
      // Model description label
      addHtmlLabel(
        model === "oklch" ? "L ↑ · C 径向 · H 环绕" : "L* ↑ · C* 径向 · h° 环绕",
        new THREE.Vector3(-0.3, 0.4, 0),
      );
    }

    function addHtmlLabel(text: string, pos3D: THREE.Vector3) {
      if (!labelContainerRef.current) return;
      const el = document.createElement("span");
      el.textContent = text;
      el.style.cssText =
        "position:absolute;font-size:11px;color:#666;white-space:nowrap;transform:translate(-50%,-50%);pointer-events:none;";
      labelContainerRef.current.appendChild(el);
      const items = (labelContainerRef.current as any).__cusLabels as
        | { el: HTMLSpanElement; pos: THREE.Vector3 }[]
        | undefined;
      if (items) items.push({ el, pos: pos3D });
    }
  }, [
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
    haloKeys,
    volumePoints,
    slice,
  ]);

  return (
    <div
      ref={containerRef}
      className="space-3d"
      style={{ position: "relative", width: "100%", height: 620 }}
      role="img"
      aria-label={`${model} 三维色彩空间`}
      tabIndex={0}
    />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * UX-02 §18–§19：将世界空间射线转换为 §14 OKLab 空间（X=a, Y=L, Z=b）后
 * 与 Volume / Slice 平面求交，返回连续 OKLab 坐标。
 *
 * Designer 的 oklab 投影为 position(lab) = [2a, 2b, l-0.5]（世界坐标），
 * 其逆变换为 a=wx/2, b=wy/2, l=wz+0.5。方向向量不受平移影响，仅受缩放影响。
 * 若提供了切片定义，优先与切片平面求交（§18：Slice Intersection）；
 * 否则与整个 Volume 包围盒求交（§18：Volume Intersection）。
 */
function pickOklabFromRay(
  ray: THREE.Ray,
  slice: SliceDefinition | null | undefined,
): Oklab | null {
  const o = ray.origin;
  const d = ray.direction;
  // 世界 → §14（X=a, Y=L, Z=b）。
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
 *
 * Designer oklab 投影：worldX=2a, worldY=2b, worldZ=l-0.5。
 * - axis="L"（固定 l）：worldZ=value-0.5，平面展开于 worldX×worldY。
 * - axis="a"（固定 a）：worldX=2·value，平面展开于 worldY×worldZ。
 * - axis="b"（固定 b）：worldY=2·value，平面展开于 worldX×worldZ。
 */
function buildSlicePlaneMesh(slice: SliceDefinition): THREE.Mesh | null {
  const A = OKLAB_BOUNDS.a[1] * 2; // 0.8
  const B = OKLAB_BOUNDS.b[1] * 2; // 0.8
  const L0 = OKLAB_BOUNDS.l[0] - 0.5; // -0.5
  const L1 = OKLAB_BOUNDS.l[1] - 0.5; // 0.5
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
  // 两个三角形组成四边形（0-1-2, 0-2-3）。
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
  // 平面边框（§29：用户可识别切片位置）。
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

function updateHtmlLabels(
  camera: THREE.Camera,
  container: HTMLDivElement,
  items: { el: HTMLSpanElement; pos: THREE.Vector3 }[],
) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  // Clamp labels within container bounds (with padding to prevent clipping).
  const padX = Math.min(40, w * 0.1);
  const padY = Math.min(30, h * 0.08);
  for (const item of items) {
    const v = item.pos.clone().project(camera);
    const rawX = ((v.x + 1) / 2) * w;
    const rawY = ((-v.y + 1) / 2) * h;
    const x = Math.max(padX, Math.min(w - padX, rawX));
    const y = Math.max(padY, Math.min(h - padY, rawY));
    item.el.style.left = `${x}px`;
    item.el.style.top = `${y}px`;
    item.el.style.display = v.z > 1 ? "none" : "";
  }
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse?.((child: any) => {
    child.geometry?.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m: any) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
  if ((obj as any).geometry) (obj as any).geometry.dispose();
  if ((obj as any).material) {
    if (Array.isArray((obj as any).material)) {
      (obj as any).material.forEach((m: any) => m.dispose());
    } else {
      (obj as any).material.dispose();
    }
  }
}

/**
 * CIELCh → 3D position for OKLCH/LCH views.
 * Mirrors the `position()` function from ColorSpaceView.
 */
function cieLchToPos(
  l: number,
  c: number,
  h: number,
  model: string,
): Point3 {
  // Simplified: for LCH view, use cylindrical coordinates
  const rad = (h * Math.PI) / 180;
  if (model === "lch") {
    return [
      (c * Math.cos(rad)) / 125,
      (c * Math.sin(rad)) / 125,
      l / 100 - 0.5,
    ];
  }
  // OKLCH
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
