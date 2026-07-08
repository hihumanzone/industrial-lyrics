import * as THREE from 'three';
import { LyricLine } from '../types/lyrics';
import { NeonWord } from './NeonWord';
import { MechanicalArmature } from './MechanicalArmature';
import { TextureGenerator, PBRTextures } from './TextureGenerator';
import { calculateSubLines, MAX_PANEL_WIDTH, PANEL_PADDING } from './SubLineCalculator';
import { SparkSystem } from './SparkSystem';
import { BubbleSystem } from './BubbleSystem';

export class LyricPanel {
  public group: THREE.Group;
  public data: LyricLine;
  public index: number;
  
  private boltMeshes: THREE.Mesh[] = [];
  private neonWords: NeonWord[] = [];
  public armature!: MechanicalArmature;

  // Pause Panel Components
  private progressMesh!: THREE.Mesh;
  private valveWheel!: THREE.Group;
  private currentProgress = 0;

  // Visual Groups
  private wiresGroup!: THREE.Group;
  private ledsGroup!: THREE.Group;

  // LED State
  private leds: { mesh: THREE.Mesh; baseColor: THREE.Color; mode: 'blink' | 'pulse'; phaseOffset: number }[] = [];

  private sparkSystem!: SparkSystem;
  private bubbleSystem?: BubbleSystem;

  // Layout positions
  public currentPosition = new THREE.Vector3(0, 0, -10);
  public targetPosition = new THREE.Vector3(0, 0, -10);

  public width = 6.0;
  public height = 1.0;
  private depth = 0.15;
  private subLineCount = 1;

  // Sub-line layout constants
  private static readonly SUB_LINE_HEIGHT = 1.0;
  private static readonly WELD_SEAM_HEIGHT = 0.06;

  // Static shared assets to optimize memory
  private static plateGeometryCache: { [key: string]: THREE.ExtrudeGeometry } = {};
  private static boltGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6);
  private static washerGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.015, 8);
  private static boltMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3834,
    roughness: 0.6,
    metalness: 0.9
  });
  private static weldSeamMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2520,
    roughness: 0.95,
    metalness: 0.85,
    bumpScale: 0.1
  });

  // Static shared geometries to avoid GC and construction churn
  private static bracketGeometry = new THREE.BoxGeometry(0.4, 0.5, 0.22);
  private static glassTubeGeometry = (() => {
    const geom = new THREE.CylinderGeometry(0.09, 0.09, 1.0, 16, 1, true);
    geom.rotateZ(Math.PI / 2);
    return geom;
  })();
  private static progressCoreGeometry = (() => {
    const geom = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 16);
    geom.rotateZ(Math.PI / 2);
    return geom;
  })();
  private static valveRimGeometry = new THREE.TorusGeometry(0.18, 0.02, 8, 16);
  private static valveSpokeGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6);
  private static valveHubGeometry = (() => {
    const geom = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8);
    geom.rotateX(Math.PI / 2);
    return geom;
  })();
  private static ledSphereGeometryPause = new THREE.SphereGeometry(0.04, 8, 8);
  private static ledSphereGeometryNormal = new THREE.SphereGeometry(0.032, 8, 8);
  private static supportRodGeometry = (() => {
    const geom = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8);
    geom.rotateZ(Math.PI / 2);
    return geom;
  })();
  private static spliceSlabGeometry = new THREE.BoxGeometry(0.16, 0.55, 0.04);
  private static spliceVertWeldGeometry = new THREE.BoxGeometry(0.02, 0.55 + 0.02, 0.02);
  private static spliceHorizWeldGeometry = new THREE.BoxGeometry(0.16 + 0.02, 0.02, 0.02);
  private static weldSeamGeometry = new THREE.BoxGeometry(1.0, 0.06, 0.15 + 0.01);
  private static wireSocketGeometry = (() => {
    const geom = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8);
    geom.rotateX(Math.PI / 2);
    return geom;
  })();

  private static wireGeometryCache: { [key: string]: THREE.TubeGeometry } = {};
  private static borderWireGeometryCache: { [key: string]: THREE.TubeGeometry } = {};

  private static socketMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f,
    roughness: 0.8,
    metalness: 0.4
  });
  private static wireMaterial = new THREE.MeshStandardMaterial({
    color: 0x121214,
    roughness: 0.6,
    metalness: 0.2
  });

  // Reusable scratch vectors to avoid garbage collection allocations in update/render loops
  private static scratchLocalPos = new THREE.Vector3();
  private static scratchSparkEmitPos = new THREE.Vector3();
  private static scratchPauseWorldPos = new THREE.Vector3();

  constructor(data: LyricLine, index: number, isRepeated: boolean) {
    this.data = data;
    this.index = index;
    this.group = new THREE.Group();

    // Initialize Spark System
    this.sparkSystem = new SparkSystem(60);
    this.group.add(this.sparkSystem.mesh);

    // 1. Retrieve procedural PBR textures from the generator
    const textures = TextureGenerator.getPBRTextures();

    // 2. Build panel components
    if (this.data.isPause) {
      this.buildPausePanel();
    } else {
      this.buildPanel(textures, isRepeated);
    }

    // 3. Connect mechanical armature on left side
    const attachmentOffset = new THREE.Vector3(-this.width / 2, 0, 0);
    this.armature = new MechanicalArmature(attachmentOffset, {
      map: textures.map,
      bumpMap: textures.bumpMap,
      roughnessMap: textures.roughnessMap,
      metalnessMap: textures.metalnessMap
    });
  }

  private buildPausePanel(): void {
    this.width = 5.5;
    this.height = 0.3;
    this.depth = 0.15;

    const pool = TextureGenerator.getMaterialPool();
    const bracketMaterial = pool.plateMaterials[0]; // Reuse shared plate material for brackets and valve

    // 1. Support Brackets at left and right ends
    const bracketWidth = 0.4;
    const bracketHeight = 0.5;
    const bracketDepth = 0.22;

    const leftBracket = new THREE.Mesh(LyricPanel.bracketGeometry, bracketMaterial);
    leftBracket.position.set(-this.width / 2 + bracketWidth / 2, 0, 0);
    this.group.add(leftBracket);

    const rightBracket = new THREE.Mesh(LyricPanel.bracketGeometry, bracketMaterial);
    rightBracket.position.set(this.width / 2 - bracketWidth / 2, 0, 0);
    this.group.add(rightBracket);

    // Add decorative bolts/rivets on the brackets
    const boltZ = bracketDepth / 2 + 0.01;
    const boltOffsetX = bracketWidth / 2 - 0.1;
    const boltOffsetY = bracketHeight / 2 - 0.1;

    const leftBoltPositions = [
      [leftBracket.position.x - boltOffsetX, boltOffsetY],
      [leftBracket.position.x + boltOffsetX, boltOffsetY],
      [leftBracket.position.x - boltOffsetX, -boltOffsetY],
      [leftBracket.position.x + boltOffsetX, -boltOffsetY]
    ];
    const rightBoltPositions = [
      [rightBracket.position.x - boltOffsetX, boltOffsetY],
      [rightBracket.position.x + boltOffsetX, boltOffsetY],
      [rightBracket.position.x - boltOffsetX, -boltOffsetY],
      [rightBracket.position.x + boltOffsetX, -boltOffsetY]
    ];

    [...leftBoltPositions, ...rightBoltPositions].forEach(([bx, by]) => {
      const bolt = new THREE.Mesh(LyricPanel.boltGeometry, LyricPanel.boltMaterial);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(bx, by, boltZ);
      this.group.add(bolt);
      this.boltMeshes.push(bolt);
    });

    // 2. Double-rod horizontal support frame (rusting steel rods)
    const rodLength = this.width - bracketWidth * 2;

    const topRod = new THREE.Mesh(LyricPanel.supportRodGeometry, bracketMaterial);
    topRod.scale.set(rodLength, 1, 1);
    topRod.position.set(0, 0.15, 0);
    this.group.add(topRod);

    const bottomRod = new THREE.Mesh(LyricPanel.supportRodGeometry, bracketMaterial);
    bottomRod.scale.set(rodLength, 1, 1);
    bottomRod.position.set(0, -0.15, 0);
    this.group.add(bottomRod);

    // 3. Central Glass Conduit (outer glass tube)
    const glassLength = rodLength;

    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.95,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });

    const glassTube = new THREE.Mesh(LyricPanel.glassTubeGeometry, glassMaterial);
    glassTube.scale.set(glassLength, 1, 1);
    glassTube.position.set(0, 0, 0);
    this.group.add(glassTube);

    // 4. Progress indicator - glowing neon core inside glass tube
    const progressMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6e28, // orange neon molten metal
      emissive: 0xff6e28,
      emissiveIntensity: 2.5,
      roughness: 0.2,
      metalness: 0.1
    });

    this.progressMesh = new THREE.Mesh(LyricPanel.progressCoreGeometry, progressMaterial);
    const startX = -glassLength / 2;
    this.progressMesh.scale.set(1, 0.001, 1);
    this.progressMesh.position.set(startX, 0, 0);
    this.group.add(this.progressMesh);

    // 5. Industrial Rotating Valve Wheel (placed on the left bracket)
    this.valveWheel = new THREE.Group();
    const wheelMaterial = pool.plateMaterials[0]; // Reuse shared plate material for valve wheel
    
    const rim = new THREE.Mesh(LyricPanel.valveRimGeometry, wheelMaterial);
    this.valveWheel.add(rim);

    const spoke1 = new THREE.Mesh(LyricPanel.valveSpokeGeometry, wheelMaterial);
    this.valveWheel.add(spoke1);

    const spoke2 = new THREE.Mesh(LyricPanel.valveSpokeGeometry, wheelMaterial);
    spoke2.rotation.z = Math.PI / 2;
    this.valveWheel.add(spoke2);

    const hub = new THREE.Mesh(LyricPanel.valveHubGeometry, wheelMaterial);
    this.valveWheel.add(hub);

    this.valveWheel.position.set(leftBracket.position.x, 0, bracketDepth / 2 + 0.03);
    this.group.add(this.valveWheel);

    // 6. Pulse LEDs on brackets
    this.ledsGroup = new THREE.Group();
    this.group.add(this.ledsGroup);

    const ledZ = bracketDepth / 2 + 0.015;
    this.createLED(
      new THREE.Vector3(leftBracket.position.x - 0.42, 0, ledZ),
      0xdd2200,
      new THREE.Color(0xff3300),
      'pulse',
      0,
      LyricPanel.ledSphereGeometryPause
    );
    this.createLED(
      new THREE.Vector3(rightBracket.position.x + 0.22, 0, ledZ),
      0xdd2200,
      new THREE.Color(0xff3300),
      'pulse',
      Math.PI,
      LyricPanel.ledSphereGeometryPause
    );

    // 8. Initialize Bubbles System elements
    this.bubbleSystem = new BubbleSystem(50);
    this.group.add(this.bubbleSystem.mesh);
  }

  /**
   * Creates a rounded rectangle plate geometry with configurable corner rounding.
   * @param roundTop - whether to round the top two corners
   * @param roundBottom - whether to round the bottom two corners
   */
  private static getPlateGeometry(
    width: number,
    height: number,
    depth: number,
    roundTop: boolean,
    roundBottom: boolean
  ): THREE.ExtrudeGeometry {
    const quantizedWidth = Math.round(width * 2) / 2;
    const cacheKey = `${quantizedWidth}_${height}_${roundTop ? 1 : 0}_${roundBottom ? 1 : 0}`;
    let geom = LyricPanel.plateGeometryCache[cacheKey];
    if (geom) return geom;

    const shape = new THREE.Shape();
    const hw = quantizedWidth / 2;
    const hh = height / 2;
    const r = 0.08; // Corner radius
    const rTop = roundTop ? r : 0;
    const rBot = roundBottom ? r : 0;

    // Bottom-left corner
    shape.moveTo(-hw + rBot, -hh);
    // Bottom edge -> bottom-right corner
    shape.lineTo(hw - rBot, -hh);
    if (rBot > 0) {
      shape.quadraticCurveTo(hw, -hh, hw, -hh + rBot);
    }
    // Right edge -> top-right corner
    shape.lineTo(hw, hh - rTop);
    if (rTop > 0) {
      shape.quadraticCurveTo(hw, hh, hw - rTop, hh);
    }
    // Top edge -> top-left corner
    shape.lineTo(-hw + rTop, hh);
    if (rTop > 0) {
      shape.quadraticCurveTo(-hw, hh, -hw, hh - rTop);
    }
    // Left edge -> bottom-left corner
    shape.lineTo(-hw, -hh + rBot);
    if (rBot > 0) {
      shape.quadraticCurveTo(-hw, -hh, -hw + rBot, -hh);
    }

    const extrudeSettings = {
      steps: 1,
      depth: depth - 0.03,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelOffset: 0,
      bevelSegments: 4
    };

    geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center();
    LyricPanel.plateGeometryCache[cacheKey] = geom;
    return geom;
  }

  private buildPanel(textures: PBRTextures, isRepeated: boolean): void {
    // 1. Instantiate word sub-components first to measure total text length
    const wordsSpacing = 0.20; // Spacing in 3D units between words
    let totalWordsWidth = 0;

    this.neonWords = this.data.words.map(w => {
      const neonWord = new NeonWord(w, isRepeated);
      totalWordsWidth += neonWord.getWidth3D();
      return neonWord;
    });

    totalWordsWidth += wordsSpacing * (this.neonWords.length - 1);

    // 2. Calculate sub-lines to prevent overflow
    const maxContentWidth = MAX_PANEL_WIDTH - PANEL_PADDING;
    const subLines = calculateSubLines(this.neonWords, maxContentWidth, wordsSpacing);
    this.subLineCount = subLines.length;

    // Determine panel width: use max of all sub-line widths (+ padding), clamped to MAX_PANEL_WIDTH
    const maxSubLineWidth = subLines.reduce((max, sl) => Math.max(max, sl.totalWidth), 0);
    this.width = Math.min(MAX_PANEL_WIDTH, Math.max(3.5, maxSubLineWidth + PANEL_PADDING));
    this.width = Math.round(this.width * 2) / 2;

    // Calculate total stacked height
    const slHeight = LyricPanel.SUB_LINE_HEIGHT;
    const weldH = LyricPanel.WELD_SEAM_HEIGHT;
    this.height = this.subLineCount * slHeight + (this.subLineCount - 1) * weldH;

    // Apply texture to weld seam material for consistency
    if (!LyricPanel.weldSeamMaterial.bumpMap) {
      LyricPanel.weldSeamMaterial.bumpMap = textures.bumpMap;
      LyricPanel.weldSeamMaterial.needsUpdate = true;
    }

    const pool = TextureGenerator.getMaterialPool();

    // 3. Build plates — one per sub-line, stacked vertically with weld seams
    const isMultiRow = this.subLineCount > 1;
    const wordMountZ = this.depth / 2 + 0.05; // word Z offset from plate

    for (let row = 0; row < this.subLineCount; row++) {
      const subLine = subLines[row];
      // Y center of this sub-line's plate relative to the group origin (center of stacked unit)
      const rowY = (this.height / 2) - (slHeight / 2) - row * (slHeight + weldH);

      // Determine corner rounding for welded edges
      const roundTop = !isMultiRow || row === 0;
      const roundBottom = !isMultiRow || row === this.subLineCount - 1;

      // Fetch material from the shared pool
      const variantIndex = Math.abs(this.index + row) % pool.plateMaterials.length;
      const plateMaterial = pool.plateMaterials[variantIndex];

      const plateGeom = LyricPanel.getPlateGeometry(this.width, slHeight, this.depth, roundTop, roundBottom);
      const plateMesh = new THREE.Mesh(plateGeom, plateMaterial);
      plateMesh.position.set(0, rowY, 0);
      this.group.add(plateMesh);



      // Weld seam between this plate and the one above (for rows > 0)
      if (row > 0) {
        const weldMesh = new THREE.Mesh(LyricPanel.weldSeamGeometry, LyricPanel.weldSeamMaterial);
        weldMesh.scale.set(this.width - 0.04, 1, 1);
        // Position between the bottom of the previous plate and the top of this plate
        const weldY = rowY + slHeight / 2 + weldH / 2;
        weldMesh.position.set(0, weldY, 0);
        this.group.add(weldMesh);

        // Add industrial connecting slabs (splice plates) and bolts bridging the seam
        const numSlabs = Math.max(2, Math.floor(this.width / 1.8));
        const margin = 0.6;
        const availableWidth = this.width - 2 * margin;
        const xPositions: number[] = [];
        if (numSlabs === 1) {
          xPositions.push(0);
        } else {
          const step = availableWidth / (numSlabs - 1);
          for (let i = 0; i < numSlabs; i++) {
            xPositions.push(-availableWidth / 2 + i * step);
          }
        }

        const slabW = 0.16;
        const slabH = 0.55;
        const slabD = 0.04;

        xPositions.forEach(posX => {
          // Create a local assembly group for the connector slab and its components
          const slabGroup = new THREE.Group();
          slabGroup.position.set(posX, weldY, this.depth / 2);
          
          // Random rotation between 45 and 65 degrees, alternating direction
          const angleDeg = 45 + Math.random() * 20;
          const sign = Math.random() < 0.5 ? 1 : -1;
          slabGroup.rotation.z = sign * (angleDeg * Math.PI / 180);
          
          this.group.add(slabGroup);

          // Retrieve slab material from shared pool
          const slabVariantIndex = Math.abs(this.index + row + Math.floor(posX * 10)) % pool.slabMaterials.length;
          const slabMaterial = pool.slabMaterials[slabVariantIndex];

          const slabMesh = new THREE.Mesh(LyricPanel.spliceSlabGeometry, slabMaterial);
          slabMesh.position.set(0, 0, slabD / 2);
          slabGroup.add(slabMesh);

          // 2. Weld seams around slab boundaries (local coordinates)
          const borderWeldZ = 0.008;
          
          // Left vertical weld seam
          const leftWeld = new THREE.Mesh(LyricPanel.spliceVertWeldGeometry, LyricPanel.weldSeamMaterial);
          leftWeld.position.set(-slabW / 2, 0, borderWeldZ);
          slabGroup.add(leftWeld);

          // Right vertical weld seam
          const rightWeld = new THREE.Mesh(LyricPanel.spliceVertWeldGeometry, LyricPanel.weldSeamMaterial);
          rightWeld.position.set(slabW / 2, 0, borderWeldZ);
          slabGroup.add(rightWeld);

          // Top horizontal weld seam
          const topWeld = new THREE.Mesh(LyricPanel.spliceHorizWeldGeometry, LyricPanel.weldSeamMaterial);
          topWeld.position.set(0, slabH / 2, borderWeldZ);
          slabGroup.add(topWeld);

          // Bottom horizontal weld seam
          const bottomWeld = new THREE.Mesh(LyricPanel.spliceHorizWeldGeometry, LyricPanel.weldSeamMaterial);
          bottomWeld.position.set(0, -slabH / 2, borderWeldZ);
          slabGroup.add(bottomWeld);

          // 3. Bolts & Washers securing the slab (local coordinates)
          const boltOffset = slabH / 3.2;
          const boltZ = slabD + 0.02;
          const washerZ = slabD + 0.005;

          // Upper bolt & washer
          const upperWasher = new THREE.Mesh(LyricPanel.washerGeometry, LyricPanel.boltMaterial);
          upperWasher.rotation.x = Math.PI / 2;
          upperWasher.position.set(0, boltOffset, washerZ);
          slabGroup.add(upperWasher);

          const upperBolt = new THREE.Mesh(LyricPanel.boltGeometry, LyricPanel.boltMaterial);
          upperBolt.rotation.x = Math.PI / 2;
          upperBolt.position.set(0, boltOffset, boltZ);
          slabGroup.add(upperBolt);
          this.boltMeshes.push(upperBolt);

          // Lower bolt & washer
          const lowerWasher = new THREE.Mesh(LyricPanel.washerGeometry, LyricPanel.boltMaterial);
          lowerWasher.rotation.x = Math.PI / 2;
          lowerWasher.position.set(0, -boltOffset, washerZ);
          slabGroup.add(lowerWasher);

          const lowerBolt = new THREE.Mesh(LyricPanel.boltGeometry, LyricPanel.boltMaterial);
          lowerBolt.rotation.x = Math.PI / 2;
          lowerBolt.position.set(0, -boltOffset, boltZ);
          slabGroup.add(lowerBolt);
          this.boltMeshes.push(lowerBolt);
        });
      }

      // Mount NeonWords for this sub-line at the correct Y
      let currentX = -subLine.totalWidth / 2;
      subLine.words.forEach(word => {
        const halfWidth = word.getWidth3D() / 2;
        const xPos = currentX + halfWidth;
        word.mesh.position.set(xPos, rowY, wordMountZ);
        this.group.add(word.mesh);
        currentX += word.getWidth3D() + wordsSpacing;
      });
    }

    // 4. Bolts at outer corners of the stacked unit
    const boltOffsetX = this.width / 2 - 0.14;
    const boltOffsetY = this.height / 2 - 0.14;
    const boltOffsetZ = this.depth / 2 + 0.01;

    const boltCoords = [
      [boltOffsetX, boltOffsetY],
      [-boltOffsetX, boltOffsetY],
      [boltOffsetX, -boltOffsetY],
      [-boltOffsetX, -boltOffsetY]
    ];

    boltCoords.forEach(([bx, by]) => {
      const bolt = new THREE.Mesh(LyricPanel.boltGeometry, LyricPanel.boltMaterial);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(bx, by, boltOffsetZ);
      this.group.add(bolt);
      this.boltMeshes.push(bolt);
    });

    // 5. Wires and Sockets (span full height)
    this.wiresGroup = new THREE.Group();
    this.group.add(this.wiresGroup);

    const bottomY = -this.height / 2;

    const leftSocket = new THREE.Mesh(LyricPanel.wireSocketGeometry, LyricPanel.socketMaterial);
    leftSocket.position.set(-this.width / 2 + 0.5, bottomY + 0.22, this.depth / 2);
    this.wiresGroup.add(leftSocket);

    const rightSocket = new THREE.Mesh(LyricPanel.wireSocketGeometry, LyricPanel.socketMaterial);
    rightSocket.position.set(this.width / 2 - 0.5, bottomY + 0.22, this.depth / 2);
    this.wiresGroup.add(rightSocket);

    // Weaving cable curve along the bottom region
    const wireY = bottomY + 0.22;
    const wireYSag = bottomY + 0.16;
    const wireYPeak = bottomY + 0.28;
    const wirePoints = [
      new THREE.Vector3(-this.width / 2 + 0.5, wireY, this.depth / 2 + 0.01),
      new THREE.Vector3(-this.width / 3, wireYSag, this.depth / 2 + 0.01),
      new THREE.Vector3(-this.width / 6, wireYPeak, this.depth / 2 + 0.01),
      new THREE.Vector3(0, wireYSag, this.depth / 2 + 0.01),
      new THREE.Vector3(this.width / 6, wireYPeak, this.depth / 2 + 0.01),
      new THREE.Vector3(this.width / 3, wireYSag, this.depth / 2 + 0.01),
      new THREE.Vector3(this.width / 2 - 0.5, wireY, this.depth / 2 + 0.01)
    ];

    // TubeGeometry cache
    const cacheKey = `${this.width}_${this.height}`;
    let wireGeometry = LyricPanel.wireGeometryCache[cacheKey];
    if (!wireGeometry) {
      const wireCurve = new THREE.CatmullRomCurve3(wirePoints);
      wireGeometry = new THREE.TubeGeometry(wireCurve, 40, 0.012, 6, false);
      LyricPanel.wireGeometryCache[cacheKey] = wireGeometry;
    }
    const weavingWire = new THREE.Mesh(wireGeometry, LyricPanel.wireMaterial);
    this.wiresGroup.add(weavingWire);

    // Border loop wire running along the outer plate edges
    const borderPoints = [
      new THREE.Vector3(-boltOffsetX, boltOffsetY, this.depth / 2 + 0.005),
      new THREE.Vector3(0, boltOffsetY - 0.04, this.depth / 2 + 0.005),
      new THREE.Vector3(boltOffsetX, boltOffsetY, this.depth / 2 + 0.005),
      new THREE.Vector3(boltOffsetX - 0.04, 0, this.depth / 2 + 0.005),
      new THREE.Vector3(boltOffsetX, -boltOffsetY, this.depth / 2 + 0.005),
      new THREE.Vector3(0, -boltOffsetY + 0.04, this.depth / 2 + 0.005),
      new THREE.Vector3(-boltOffsetX, -boltOffsetY, this.depth / 2 + 0.005),
      new THREE.Vector3(-boltOffsetX + 0.04, 0, this.depth / 2 + 0.005)
    ];

    let borderWireGeometry = LyricPanel.borderWireGeometryCache[cacheKey];
    if (!borderWireGeometry) {
      const borderCurve = new THREE.CatmullRomCurve3(borderPoints, true);
      borderWireGeometry = new THREE.TubeGeometry(borderCurve, 54, 0.009, 5, true);
      LyricPanel.borderWireGeometryCache[cacheKey] = borderWireGeometry;
    }
    const borderWire = new THREE.Mesh(borderWireGeometry, LyricPanel.wireMaterial);
    this.wiresGroup.add(borderWire);

    // 6. Corner Blinking/Pulsing LEDs (at outer corners of stacked unit)
    this.ledsGroup = new THREE.Group();
    this.group.add(this.ledsGroup);

    this.createLED(
      new THREE.Vector3(-boltOffsetX + 0.24, boltOffsetY, boltOffsetZ),
      0x11aa11,
      new THREE.Color(0x00ff00),
      'pulse',
      0,
      LyricPanel.ledSphereGeometryNormal
    );
    this.createLED(
      new THREE.Vector3(boltOffsetX - 0.24, boltOffsetY, boltOffsetZ),
      0xaa1111,
      new THREE.Color(0xff0000),
      'blink',
      Math.PI,
      LyricPanel.ledSphereGeometryNormal
    );
    this.createLED(
      new THREE.Vector3(-boltOffsetX + 0.24, -boltOffsetY, boltOffsetZ),
      0xaa1111,
      new THREE.Color(0xff0000),
      'blink',
      0,
      LyricPanel.ledSphereGeometryNormal
    );
    this.createLED(
      new THREE.Vector3(boltOffsetX - 0.24, -boltOffsetY, boltOffsetZ),
      0xaa6600,
      new THREE.Color(0xffaa00),
      'pulse',
      Math.PI / 2,
      LyricPanel.ledSphereGeometryNormal
    );

  }

  /**
   * Triggers a burst of spark particles locally on the panel.
   * Reuses scratch local position vector to avoid frames garbage generation.
   */
  public emitSparks(position: THREE.Vector3, count: number): void {
    const localPos = LyricPanel.scratchLocalPos.copy(position);
    this.group.worldToLocal(localPos);
    this.sparkSystem.emit(localPos, count);
  }

  /**
   * Updates coordinates of panels towards targets, sparks, LEDs, and word glows
   */
  public update(time: number, audioTime: number, activeIndex: number, lerpSpeed: number): void {
    // 1. Smoothly interpolate position towards target
    this.currentPosition.lerp(this.targetPosition, lerpSpeed);
    this.group.position.copy(this.currentPosition);

    const inActiveRange = this.index === activeIndex;

    if (this.data.isPause) {
      // Pause panel animation
      const duration = this.data.endTime - this.data.startTime;
      const progress = duration > 0 ? Math.max(0, Math.min(1, (audioTime - this.data.startTime) / duration)) : 0;
      this.currentProgress = progress;

      // 1. Scale and position the progress bar
      if (this.progressMesh) {
        const bracketWidth = 0.4;
        const L = this.width - bracketWidth * 2;
        const currentLength = progress * L;
        this.progressMesh.scale.set(Math.max(0.001, currentLength), 1, 1);
        this.progressMesh.position.set(-L / 2 + currentLength / 2, 0, 0);
      }

      // 2. Spin the valve wheel proportional to progress or time
      if (this.valveWheel) {
        if (inActiveRange && progress > 0 && progress < 1) {
          this.valveWheel.rotation.z = -progress * Math.PI * 4; // spin 2 full rotations
        } else if (progress >= 1) {
          this.valveWheel.rotation.z = -Math.PI * 4;
        } else {
          this.valveWheel.rotation.z = 0;
        }
      }

      // 3. Emit steam/sparks from the tip of the progress bar
      if (inActiveRange && progress > 0 && progress < 1 && Math.random() < 0.08) {
        const bracketWidth = 0.4;
        const L = this.width - bracketWidth * 2;
        const currentLength = progress * L;
        const localTip = new THREE.Vector3(-L / 2 + currentLength, 0, 0.05);
        const worldTip = localTip.clone().applyMatrix4(this.group.matrixWorld);
        this.emitSparks(worldTip, 1);
      }
    } else {
      // 2. Update neon word glows based on state machine and audio time
      this.neonWords.forEach((word) => {
        const oldState = word.glowState;
        
        let targetState: 'unlit' | 'lit' | 'flickering' | 'trailing' = 'unlit';
        
        if (inActiveRange) {
          if (audioTime >= word.data.startTime && audioTime < word.data.endTime) {
            // Currently active word: should be lit or flickering
            if (oldState === 'unlit' || oldState === 'trailing') {
              // Transition through flicker first
              targetState = 'flickering';
            } else {
              // Retain its current lit or flickering state
              targetState = oldState === 'flickering' ? 'flickering' : 'lit';
            }
          } else if (audioTime >= word.data.endTime) {
            // Already sung word in active line: trailing steady glow or flickering if triggered randomly
            targetState = oldState === 'flickering' ? 'flickering' : 'trailing';
          } else {
            // Future word: unlit
            targetState = 'unlit';
          }
        } else {
          // Line is inactive: turn off glow
          targetState = 'unlit';
        }
        
        // Apply state
        word.setGlowState(targetState, time);
        
        // Update word animations (handles active flicker transition and updates worldPosition cache)
        word.update(time, this.currentPosition);

        // Spark bursts on state updates (when a word goes active/flickering) without runtime vector allocations
        if (targetState === 'flickering' && oldState !== 'flickering') {
          const wordPos = LyricPanel.scratchSparkEmitPos.copy(word.getWorldPosition());
          const width = word.getWidth3D();
          wordPos.x += (Math.random() - 0.5) * width * 0.8;
          wordPos.y += (Math.random() - 0.5) * 0.05;
          this.emitSparks(wordPos, 3);
        }

        if (inActiveRange && (targetState === 'flickering' || targetState === 'lit')) {
          // Drop light spark particles in short, electrical bursts
          const burstCycle = Math.sin(time * 10);
          if (burstCycle > 0.85 && Math.random() < 0.6) {
            const wordPos = LyricPanel.scratchSparkEmitPos.copy(word.getWorldPosition());
            const width = word.getWidth3D();
            wordPos.x += (Math.random() - 0.5) * width * 0.9;
            wordPos.y += (Math.random() - 0.5) * 0.08;
            this.emitSparks(wordPos, 1);
          }
        }
      });

      // Occasionally trigger a flicker on a random word in the active line
      if (inActiveRange && this.neonWords.length > 0) {
        if (Math.random() < 0.003) {
          const randomWord = this.neonWords[Math.floor(Math.random() * this.neonWords.length)];
          // Allow random flickering on both currently lit and previously sung trailing words
          if (randomWord.glowState === 'lit' || randomWord.glowState === 'trailing') {
            const wasTrailing = randomWord.glowState === 'trailing';
            randomWord.setGlowState('flickering', time);
            
            if (wasTrailing) {
              const wordPos = LyricPanel.scratchSparkEmitPos.copy(randomWord.getWorldPosition());
              const width = randomWord.getWidth3D();
              wordPos.x += (Math.random() - 0.5) * width * 0.8;
              wordPos.y += (Math.random() - 0.5) * 0.05;
              this.emitSparks(wordPos, 2);
            }
          }
        }
      }
    }

    // 3. Animate local sparks
    this.sparkSystem.update();

    // 3.5. Animate liquid bubbles
    if (this.bubbleSystem) {
      this.bubbleSystem.update(time, inActiveRange, this.currentProgress, this.width);
    }

    // 4. Animate corner LEDs
    this.leds.forEach(led => {
      const mat = led.mesh.material as THREE.MeshStandardMaterial;
      if (led.mode === 'blink') {
        const active = Math.sin(time * 6 + led.phaseOffset) > 0;
        mat.emissiveIntensity = active ? 1.6 : 0.05;
      } else {
        // pulse
        const intens = 0.5 + Math.sin(time * 3 + led.phaseOffset) * 0.45;
        mat.emissiveIntensity = intens * 1.5;
      }
    });

    // 5. Update mechanical armatures
    this.armature.update(this.currentPosition);
  }



  public getWordGlowSources(target: { color: THREE.Color; intensity: number; position: THREE.Vector3; width: number; isTrailing: boolean; isPause?: boolean; progress?: number }[]): void {
    if (this.data.isPause) {
      if (this.currentProgress > 0 && this.progressMesh) {
        const worldPos = LyricPanel.scratchPauseWorldPos.copy(this.progressMesh.position).add(this.currentPosition);
        const bracketWidth = 0.4;
        const L = this.width - bracketWidth * 2;
        target.push({
          color: new THREE.Color(0xff6e28),
          intensity: 2.5,
          position: worldPos,
          width: this.currentProgress * L,
          isTrailing: false,
          isPause: true,
          progress: this.currentProgress
        });
      }
      return;
    }

    this.neonWords.forEach((word) => {
      const isLit = word.glowState === 'flickering' || word.glowState === 'lit';
      const isTrailing = word.glowState === 'trailing';

      if (isLit || isTrailing) {
        target.push({
          color: word.neonColor,
          intensity: word.emissiveIntensity,
          position: word.getWorldPosition(),
          width: word.getWidth3D(),
          isTrailing: isTrailing
        });
      }
    });
  }

  /**
   * Settings Toggles
   */
  public setLowPerformance(enabled: boolean): void {
    // Toggle secondary meshes to save frames in low performance mode
    if (this.wiresGroup) this.wiresGroup.visible = !enabled;
    if (this.ledsGroup) this.ledsGroup.visible = !enabled;
    this.sparkSystem.setVisible(!enabled);
  }

  public dispose(): void {
    this.neonWords.forEach(w => w.dispose());
    this.armature.dispose();
    
    // Dispose progress bar unique materials (if any)
    if (this.progressMesh) {
      if (Array.isArray(this.progressMesh.material)) {
        this.progressMesh.material.forEach(m => m.dispose());
      } else {
        this.progressMesh.material.dispose();
      }
    }

    // Traverse and dispose geometries and materials that are NOT shared
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry !== LyricPanel.boltGeometry &&
            child.geometry !== LyricPanel.washerGeometry &&
            child.geometry !== LyricPanel.bracketGeometry &&
            child.geometry !== LyricPanel.glassTubeGeometry &&
            child.geometry !== LyricPanel.progressCoreGeometry &&
            child.geometry !== LyricPanel.valveRimGeometry &&
            child.geometry !== LyricPanel.valveSpokeGeometry &&
            child.geometry !== LyricPanel.valveHubGeometry &&
            child.geometry !== LyricPanel.ledSphereGeometryPause &&
            child.geometry !== LyricPanel.ledSphereGeometryNormal &&
            child.geometry !== LyricPanel.supportRodGeometry &&
            child.geometry !== LyricPanel.spliceSlabGeometry &&
            child.geometry !== LyricPanel.spliceVertWeldGeometry &&
            child.geometry !== LyricPanel.spliceHorizWeldGeometry &&
            child.geometry !== LyricPanel.weldSeamGeometry &&
            child.geometry !== LyricPanel.wireSocketGeometry &&
            !Object.values(LyricPanel.wireGeometryCache).includes(child.geometry as any) &&
            !Object.values(LyricPanel.borderWireGeometryCache).includes(child.geometry as any)) {
          child.geometry.dispose();
        }

        const isSharedMaterial = TextureGenerator.getMaterialPool().plateMaterials.includes(child.material as any) ||
                                 TextureGenerator.getMaterialPool().slabMaterials.includes(child.material as any) ||
                                 child.material === LyricPanel.boltMaterial ||
                                 child.material === LyricPanel.weldSeamMaterial ||
                                 child.material === LyricPanel.socketMaterial ||
                                 child.material === LyricPanel.wireMaterial;
        
        if (!isSharedMaterial) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });

    // Dispose particle systems
    if (this.sparkSystem) {
      this.sparkSystem.dispose();
    }
    if (this.bubbleSystem) {
      this.bubbleSystem.dispose();
    }
  }

  private createLED(
    position: THREE.Vector3,
    colorHex: number,
    baseColor: THREE.Color,
    mode: 'blink' | 'pulse',
    phaseOffset: number,
    geometry: THREE.SphereGeometry
  ): void {
    const ledMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 1.0
    });
    const led = new THREE.Mesh(geometry, ledMat);
    led.position.copy(position);
    this.ledsGroup.add(led);
    this.leds.push({
      mesh: led,
      baseColor,
      mode,
      phaseOffset
    });
  }

  public static disposeStaticCaches(): void {
    Object.keys(LyricPanel.plateGeometryCache).forEach(key => {
      LyricPanel.plateGeometryCache[key].dispose();
    });
    LyricPanel.plateGeometryCache = {};

    Object.keys(LyricPanel.wireGeometryCache).forEach(key => {
      LyricPanel.wireGeometryCache[key].dispose();
    });
    LyricPanel.wireGeometryCache = {};

    Object.keys(LyricPanel.borderWireGeometryCache).forEach(key => {
      LyricPanel.borderWireGeometryCache[key].dispose();
    });
    LyricPanel.borderWireGeometryCache = {};
  }
}
