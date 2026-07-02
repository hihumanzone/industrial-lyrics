import * as THREE from 'three';

export class MechanicalArmature {
  public group: THREE.Group;
  
  private wallMount!: THREE.Mesh;
  private panelMount!: THREE.Mesh;
  
  // Piston groups for rotation
  private sleeveGroup!: THREE.Group;
  private rodGroup!: THREE.Group;
  
  private sleeveMesh!: THREE.Mesh;
  private rodMesh!: THREE.Mesh;
  
  // Cable line
  private cableLine!: THREE.Line;
  private cableGeometry!: THREE.BufferGeometry;
  
  // Coordinates
  private wallX = -7.5;
  private panelOffset: THREE.Vector3;
  
  // Shared materials & geometries to optimize allocations
  private static boxGeom = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  private static wallBoxGeom = new THREE.BoxGeometry(15.0, 0.4, 0.4);
  private static sleeveGeom = new THREE.CylinderGeometry(0.12, 0.12, 3.0, 8);
  private static rodGeom = new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8);
  
  private static metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x6a6864,
    roughness: 0.5,
    metalness: 0.9,
    bumpScale: 0.08
  });

  // Reusable scratch vectors to avoid garbage collection overhead in the render loop
  private static scratchPanelMountPos = new THREE.Vector3();
  private static scratchWallMountPos = new THREE.Vector3();
  private static scratchP1 = new THREE.Vector3();

  constructor(
    panelOffset: THREE.Vector3,
    textures?: {
      map: THREE.Texture | null;
      bumpMap: THREE.Texture | null;
      roughnessMap: THREE.Texture | null;
      metalnessMap: THREE.Texture | null;
    }
  ) {
    this.panelOffset = panelOffset; // Left attachment point relative to panel center
    this.group = new THREE.Group();

    // Apply textures dynamically to the shared static material
    if (textures) {
      const mat = MechanicalArmature.metalMaterial;
      if (!mat.map && textures.map) {
        mat.map = textures.map;
        mat.bumpMap = textures.bumpMap;
        mat.roughnessMap = textures.roughnessMap;
        mat.metalnessMap = textures.metalnessMap;
        mat.needsUpdate = true;
      }
    }

    this.initStructure();
  }

  private initStructure(): void {
    // 1. Mounts
    this.wallMount = new THREE.Mesh(MechanicalArmature.wallBoxGeom, MechanicalArmature.metalMaterial);
    this.group.add(this.wallMount);

    this.panelMount = new THREE.Mesh(MechanicalArmature.boxGeom, MechanicalArmature.metalMaterial);
    this.group.add(this.panelMount);

    // 2. Sleeve Group (anchored on wall, points to panel)
    this.sleeveGroup = new THREE.Group();
    this.sleeveMesh = new THREE.Mesh(MechanicalArmature.sleeveGeom, MechanicalArmature.metalMaterial);
    
    // Rotate the mesh instance instead of mutating the shared geometry
    this.sleeveMesh.rotation.x = Math.PI / 2;
    // Offset mesh so its pivot is at the wall mount base (half of sleeve length 3.0)
    this.sleeveMesh.position.set(0, 0, 1.5);
    this.sleeveGroup.add(this.sleeveMesh);
    this.group.add(this.sleeveGroup);

    // 3. Rod Group (anchored on panel, points to wall)
    this.rodGroup = new THREE.Group();
    this.rodMesh = new THREE.Mesh(MechanicalArmature.rodGeom, MechanicalArmature.metalMaterial);
    
    // Rotate the mesh instance instead of mutating the shared geometry
    this.rodMesh.rotation.x = Math.PI / 2;
    // Offset mesh so its pivot is at the panel mount base, extending towards the wall mount (positive Z)
    this.rodMesh.position.set(0, 0, 1.5);
    this.rodGroup.add(this.rodMesh);
    this.group.add(this.rodGroup);

    // 4. Drooping Cable
    this.cableGeometry = new THREE.BufferGeometry();
    const pointsCount = 16;
    const positionArray = new Float32Array(pointsCount * 3);
    this.cableGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    
    const cableMaterial = new THREE.LineBasicMaterial({
      color: 0x111113,
      linewidth: 1 // standard line width (custom values are ignored by modern WebGL APIs)
    });
    this.cableLine = new THREE.Line(this.cableGeometry, cableMaterial);
    this.cableLine.frustumCulled = false; // Disable frustum culling since we manually cull the group in LyricsMachine
    this.group.add(this.cableLine);
  }

  /**
   * Updates armature kinematics based on the panel's current 3D position.
   * Leverages pre-allocated scratch variables to eliminate object allocations.
   */
  public update(panelWorldPos: THREE.Vector3): void {
    const panelMountPos = MechanicalArmature.scratchPanelMountPos;
    panelMountPos.copy(panelWorldPos).add(this.panelOffset);

    const wallMountPos = MechanicalArmature.scratchWallMountPos;
    wallMountPos.set(this.wallX, panelMountPos.y, -1.0); // fixed wall Y & Z

    // Update mount positions
    this.wallMount.position.copy(wallMountPos);
    // Shift left to extend only the left end width while keeping the right side position unchanged.
    // Old width: 0.4 (right face is at wallMountPos.x + 0.2).
    // New width: 15.0 (right face is at position.x + 7.5).
    // Solve: position.x + 7.5 = wallMountPos.x + 0.2 => position.x = wallMountPos.x - 7.3.
    this.wallMount.position.x += 0.2 - 15.0 / 2;
    this.panelMount.position.copy(panelMountPos);

    // Position sleeves/rods
    this.sleeveGroup.position.copy(wallMountPos);
    this.rodGroup.position.copy(panelMountPos);

    // Point them at each other
    this.sleeveGroup.lookAt(panelMountPos);
    this.rodGroup.lookAt(wallMountPos);

    // Update Cable curve dynamically without allocations
    const p0 = wallMountPos;
    const p2 = panelMountPos;
    
    // Droop down by a factor of distance and Y
    const distance = p0.distanceTo(p2);
    
    const p1 = MechanicalArmature.scratchP1;
    p1.addVectors(p0, p2).multiplyScalar(0.5);
    p1.y -= Math.max(0.8, distance * 0.4); // droop amount depends on length

    const positionAttribute = this.cableGeometry.attributes.position;
    const array = positionAttribute.array as Float32Array;

    // Direct mathematical evaluation of quadratic Bezier points to write directly into geometry buffer
    // B(t) = (1-t)^2 * P0 + 2*(1-t)*t * P1 + t^2 * P2
    const totalDivisions = 15; // results in 16 vertices (0 to 15)
    for (let i = 0; i <= totalDivisions; i++) {
      const t = i / totalDivisions;
      const mt = 1.0 - t;
      const mt2 = mt * mt;
      const t2 = t * t;
      const mt_t_2 = 2.0 * mt * t;

      array[i * 3]     = mt2 * p0.x + mt_t_2 * p1.x + t2 * p2.x;
      array[i * 3 + 1] = mt2 * p0.y + mt_t_2 * p1.y + t2 * p2.y;
      array[i * 3 + 2] = mt2 * p0.z + mt_t_2 * p1.z + t2 * p2.z;
    }
    
    positionAttribute.needsUpdate = true;
    this.cableGeometry.computeBoundingSphere();
    this.cableGeometry.computeBoundingBox();
  }

  public dispose(): void {
    this.cableGeometry.dispose();
    // Shared static geometries/materials are disposed at higher application scope (or kept),
    // so do not dispose them here.
  }
}
