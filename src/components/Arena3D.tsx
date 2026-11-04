import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SimState } from '../robotics/simulation';
import { Trajectory, VehicleParams, WaypointInput } from '../types/robotics';

interface Arena3DProps {
  simState: SimState;
  trajectory: Trajectory;
  waypoints: WaypointInput[];
  vehicle: VehicleParams;
}

export type CameraMode = 'orbit' | 'follow';

export const Arena3D: React.FC<Arena3DProps> = ({
  simState,
  trajectory,
  waypoints,
  vehicle,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');

  // Mutable refs for Three.js scene objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Robot sub-components
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const leftFrontKnuckleRef = useRef<THREE.Group | null>(null);
  const rightFrontKnuckleRef = useRef<THREE.Group | null>(null);

  // Trajectory ribbon and gates
  const ribbonMeshRef = useRef<THREE.Mesh | null>(null);
  const gatesGroupRef = useRef<THREE.Group | null>(null);

  // Latest state ref for 60fps animation loop without React state closures
  const stateRef = useRef({ simState, trajectory, waypoints, cameraMode });
  stateRef.current = { simState, trajectory, waypoints, cameraMode };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Detect Software WebGL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Setup Three.js Scene, Camera, Renderer
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    scene.fog = new THREE.FogExp2('#090d16', 0.04);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
    // Position camera overlooking the 9m x 5m arena from top-quarter
    camera.position.set(0, 7.5, 6.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below floor
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 3. Lighting Rig (3-Point Studio Setup)
    // Cool sky/ground hemisphere
    const hemiLight = new THREE.HemisphereLight('#38bdf8', '#0f172a', 0.8);
    scene.add(hemiLight);

    // Warm directional key light
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.8);
    keyLight.position.set(5, 10, 4);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 25;
      const d = 6;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    // Subtle blue fill light
    const fillLight = new THREE.DirectionalLight('#0284c7', 0.6);
    fillLight.position.set(-6, 5, -5);
    scene.add(fillLight);

    // 4. Arena Floor (9m x 5m with Red Tape Border & 1m Grid)
    // Three.js coords: X is right (+x), Y is up (+y in 3D), Z is down (-z is +y in math)
    // To match ME416 convention (+x right, +y up towards Comm Ave):
    // Three.js: X_3D = x, Y_3D = height, Z_3D = -y
    const floorGeo = new THREE.PlaneGeometry(9.0, 5.0);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.85,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    // Floor Grid (1m divisions)
    const gridHelper = new THREE.GridHelper(10, 10, '#38bdf8', '#1e293b');
    gridHelper.position.y = 0.002;
    scene.add(gridHelper);

    // Red Tape Border Mesh
    const borderPoints = [
      new THREE.Vector3(-4.5, 0.005, -2.5),
      new THREE.Vector3(4.5, 0.005, -2.5),
      new THREE.Vector3(4.5, 0.005, 2.5),
      new THREE.Vector3(-4.5, 0.005, 2.5),
      new THREE.Vector3(-4.5, 0.005, -2.5),
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({ color: '#ef4444', linewidth: 3 });
    const borderLine = new THREE.Line(borderGeo, borderMat);
    scene.add(borderLine);

    // 5. Procedural AgileX LIMO Robot 3D Model
    // Real LIMO specs: Length=0.322m, Width=0.220m, Height=0.251m, Wheelbase L=0.20m, Track=0.175m
    const robotGroup = new THREE.Group();
    robotGroupRef.current = robotGroup;

    // Soft Contact Shadow Plane under robot
    const shadowGeo = new THREE.PlaneGeometry(0.38, 0.28);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.004;
    robotGroup.add(shadowMesh);

    // Main Chassis Body (0.322 x 0.220 x 0.12)
    const chassisGeo = new THREE.BoxGeometry(0.322, 0.11, 0.22);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.4,
      metalness: 0.6,
    });
    const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    chassisMesh.position.y = 0.095;
    chassisMesh.castShadow = !isSoftwareGl;
    robotGroup.add(chassisMesh);

    // Top Upper Sensor Deck / Tower (LIMO LiDAR & Computer compartment)
    const towerGeo = new THREE.BoxGeometry(0.18, 0.10, 0.16);
    const towerMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.2,
      metalness: 0.8,
    });
    const towerMesh = new THREE.Mesh(towerGeo, towerMat);
    towerMesh.position.set(-0.02, 0.18, 0);
    towerMesh.castShadow = !isSoftwareGl;
    robotGroup.add(towerMesh);

    // Green Tape ME416 Marker (per manual spec: "green tape on top center")
    const tapeGeo = new THREE.PlaneGeometry(0.08, 0.05);
    const tapeMat = new THREE.MeshStandardMaterial({
      color: '#22c55e',
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const tapeMesh = new THREE.Mesh(tapeGeo, tapeMat);
    tapeMesh.rotation.x = -Math.PI / 2;
    tapeMesh.position.set(0, 0.232, 0);
    robotGroup.add(tapeMesh);

    // Forward Direction Arrow on top
    const arrowDir = new THREE.Vector3(1, 0, 0); // forward along body +x
    const arrowHelper = new THREE.ArrowHelper(
      arrowDir,
      new THREE.Vector3(0, 0.235, 0),
      0.18,
      0x38bdf8,
      0.05,
      0.03
    );
    robotGroup.add(arrowHelper);

    // Wheels & Steering Assembly
    const wheelRadius = 0.045; // 90mm diameter wheel
    const wheelWidth = 0.032;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
    wheelGeo.rotateZ(Math.PI / 2); // align axle along Z

    const tireMat = new THREE.MeshStandardMaterial({
      color: '#020617',
      roughness: 0.9,
      metalness: 0.1,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.25,
      metalness: 0.85,
    });

    const createWheelMesh = () => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = !isSoftwareGl;
      g.add(tire);
      const hubGeo = new THREE.CylinderGeometry(0.022, 0.022, wheelWidth + 0.002, 16);
      hubGeo.rotateZ(Math.PI / 2);
      const hub = new THREE.Mesh(hubGeo, rimMat);
      g.add(hub);
      return g;
    };

    // Wheelbase L = 0.20m, Track W = 0.175m
    const halfL = 0.20 / 2;  // 0.10m
    const halfW = 0.175 / 2; // 0.0875m
    const wheelY = wheelRadius;

    // Rear Wheels (fixed)
    const rlWheel = createWheelMesh();
    rlWheel.position.set(-halfL, wheelY, halfW);
    robotGroup.add(rlWheel);

    const rrWheel = createWheelMesh();
    rrWheel.position.set(-halfL, wheelY, -halfW);
    robotGroup.add(rrWheel);

    // Front Steering Knuckles (articulate in real-time with steerCmd / phi)
    const flKnuckle = new THREE.Group();
    flKnuckle.position.set(halfL, wheelY, halfW);
    const flWheel = createWheelMesh();
    flKnuckle.add(flWheel);
    robotGroup.add(flKnuckle);
    leftFrontKnuckleRef.current = flKnuckle;

    const frKnuckle = new THREE.Group();
    frKnuckle.position.set(halfL, wheelY, -halfW);
    const frWheel = createWheelMesh();
    frKnuckle.add(frWheel);
    robotGroup.add(frKnuckle);
    rightFrontKnuckleRef.current = frKnuckle;

    scene.add(robotGroup);

    // 6. Trajectory Ribbon & Gates container
    const gatesGroup = new THREE.Group();
    scene.add(gatesGroup);
    gatesGroupRef.current = gatesGroup;

    // 7. Render Loop
    let animId = 0;
    const clock = new THREE.Clock();

    // Reusable math vectors to prevent GC
    const _targetCamPos = new THREE.Vector3();
    const _targetLookAt = new THREE.Vector3();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const { simState: currentSim, trajectory: currentTraj, waypoints: currentWps, cameraMode: currentCamMode } = stateRef.current;

      // Update robot position & heading
      // Three.js coords: X = x_m, Z = -y_m, Y = 0 (on floor)
      const robotX = currentSim.x_m;
      const robotZ = -currentSim.y_m;
      const heading = currentSim.theta_rad;

      if (robotGroupRef.current) {
        robotGroupRef.current.position.set(robotX, 0, robotZ);
        // Rotation around Y axis in Three.js (standard yaw: positive is CCW in X-Z plane)
        // With Z = -y, heading measured from +x toward +y maps to rotation.y = heading
        robotGroupRef.current.rotation.y = heading;
      }

      // Articulate front steering knuckles with commanded steer angle
      const steer = currentSim.steer_rad;
      if (leftFrontKnuckleRef.current) {
        leftFrontKnuckleRef.current.rotation.y = steer;
      }
      if (rightFrontKnuckleRef.current) {
        rightFrontKnuckleRef.current.rotation.y = steer;
      }

      // Camera management
      if (currentCamMode === 'follow' && cameraRef.current) {
        // Follow camera: placed behind and above the robot
        const followDist = 1.3;
        const followHeight = 0.75;
        const backX = robotX - followDist * Math.cos(heading);
        const backZ = robotZ + followDist * Math.sin(heading);

        _targetCamPos.set(backX, followHeight, backZ);
        _targetLookAt.set(
          robotX + 0.4 * Math.cos(heading),
          0.15,
          robotZ - 0.4 * Math.sin(heading)
        );

        cameraRef.current.position.lerp(_targetCamPos, 0.1);
        controls.target.lerp(_targetLookAt, 0.1);
        controls.update();
      } else {
        controls.update();
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [vehicle]);

  // Update Trajectory Ribbon & Gate Arches when trajectory / waypoints change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old ribbon
    if (ribbonMeshRef.current) {
      scene.remove(ribbonMeshRef.current);
      ribbonMeshRef.current.geometry.dispose();
      ribbonMeshRef.current = null;
    }

    // Build new extruded trajectory ribbon
    const pts = trajectory.points;
    if (pts.length > 1) {
      const ribbonWidth = 0.06;
      const numVerts = pts.length * 2;
      const positions = new Float32Array(numVerts * 3);
      const indices: number[] = [];

      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const tx = pt.x;
        const tz = -pt.y;
        const normalX = -Math.sin(pt.theta);
        const normalZ = -Math.cos(pt.theta);

        const leftX = tx + (ribbonWidth / 2) * normalX;
        const leftZ = tz + (ribbonWidth / 2) * normalZ;
        const rightX = tx - (ribbonWidth / 2) * normalX;
        const rightZ = tz - (ribbonWidth / 2) * normalZ;

        // Elevated slightly above floor (y = 0.012)
        const y = 0.012;

        positions[i * 6 + 0] = leftX;
        positions[i * 6 + 1] = y;
        positions[i * 6 + 2] = leftZ;

        positions[i * 6 + 3] = rightX;
        positions[i * 6 + 4] = y;
        positions[i * 6 + 5] = rightZ;

        if (i < pts.length - 1) {
          const v0 = i * 2;
          const v1 = i * 2 + 1;
          const v2 = (i + 1) * 2;
          const v3 = (i + 1) * 2 + 1;
          indices.push(v0, v1, v2, v1, v3, v2);
        }
      }

      const ribbonGeo = new THREE.BufferGeometry();
      ribbonGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      ribbonGeo.setIndex(indices);
      ribbonGeo.computeVertexNormals();

      const ribbonMat = new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      });

      const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
      scene.add(ribbonMesh);
      ribbonMeshRef.current = ribbonMesh;
    }

    // Update Gate Arches
    if (gatesGroupRef.current) {
      while (gatesGroupRef.current.children.length > 0) {
        const child = gatesGroupRef.current.children[0];
        gatesGroupRef.current.remove(child);
      }

      waypoints.forEach((wp, idx) => {
        if (!wp.isGate) return;
        const gateArch = new THREE.Group();
        gateArch.position.set(wp.x, 0, -wp.y);
        gateArch.rotation.y = (wp.thetaDeg * Math.PI) / 180;

        // Two vertical posts (clearance width 0.35m, height 0.30m)
        const postGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.30, 12);
        const archMat = new THREE.MeshStandardMaterial({
          color: '#eab308',
          roughness: 0.3,
          metalness: 0.8,
        });

        const leftPost = new THREE.Mesh(postGeo, archMat);
        leftPost.position.set(0, 0.15, 0.18);
        gateArch.add(leftPost);

        const rightPost = new THREE.Mesh(postGeo, archMat);
        rightPost.position.set(0, 0.15, -0.18);
        gateArch.add(rightPost);

        // Crossbar
        const barGeo = new THREE.BoxGeometry(0.02, 0.03, 0.38);
        const crossbar = new THREE.Mesh(barGeo, archMat);
        crossbar.position.set(0, 0.30, 0);
        gateArch.add(crossbar);

        gatesGroupRef.current?.add(gateArch);
      });
    }
  }, [trajectory, waypoints]);

  const toggleCameraMode = () => {
    const next = cameraMode === 'orbit' ? 'follow' : 'orbit';
    setCameraMode(next);
    if (next === 'orbit' && cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 7.5, 6.5);
      controlsRef.current.target.set(0, 0, 0);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3 text-slate-300">
          <span className="font-semibold text-slate-100">3D Interactive Arena</span>
          <span className="text-slate-500">AgileX LIMO (0.32m × 0.22m) · Articulated Knuckles</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleCameraMode}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors border border-slate-700"
          >
            {cameraMode === 'orbit' ? '🎥 Orbit Room View' : '🏎️ Follow Robot View'}
          </button>
        </div>
      </div>

      <div ref={mountRef} className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing" />
    </div>
  );
};
