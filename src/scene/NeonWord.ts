import * as THREE from 'three';
import { LyricWord } from '../types/lyrics';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { TextureGenerator } from './TextureGenerator';
import comfortaaFont from '../assets/comfortaa_bold.typeface.json';

export class NeonWord {
  public mesh: THREE.Group;
  public data: LyricWord;
  
  private material!: THREE.MeshStandardMaterial;
  private coreMaterial!: THREE.MeshBasicMaterial;
  
  public neonColor: THREE.Color;
  public glowState: 'unlit' | 'lit' | 'flickering' | 'trailing' = 'unlit';
  private postFlickerState: 'lit' | 'trailing' = 'lit';
  private flickerDuration = 0.35; // seconds
  private flickerStartTime = 0;
  private width3D = 0;
  
  private static font: any = null;
  
  // Static caches for geometries and width to avoid recreation
  private static outerGeometryCache: { [key: string]: THREE.BufferGeometry } = {};
  private static innerGeometryCache: { [key: string]: THREE.BufferGeometry } = {};
  private static widthCache: { [key: string]: number } = {};

  private static supportPinGeometry = (() => {
    const geom = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6);
    geom.rotateX(Math.PI / 2);
    return geom;
  })();
  
  // Reusable cache to prevent garbage collection allocations in update/render loops
  private cachedWorldPosition = new THREE.Vector3();

  constructor(data: LyricWord, isRepeated: boolean) {
    this.data = data;
    this.neonColor = isRepeated ? new THREE.Color(0x00f0ff) : new THREE.Color(0xffffff);
    
    // Initialize static FontLoader once
    if (!NeonWord.font) {
      const loader = new FontLoader();
      NeonWord.font = loader.parse(comfortaaFont as any);
    }

    this.mesh = new THREE.Group();
    
    const text = this.data.text;
    const fontSize = 0.30;
    
    let outerGeometry = NeonWord.outerGeometryCache[text];
    let innerGeometry = NeonWord.innerGeometryCache[text];
    let width3D = NeonWord.widthCache[text];

    if (!outerGeometry) {
      outerGeometry = new TextGeometry(text, {
        font: NeonWord.font,
        size: fontSize,
        depth: 0.05,
        curveSegments: 4,      // Optimized for performance
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.008,
        bevelOffset: 0,
        bevelSegments: 2
      });
      
      outerGeometry.computeBoundingBox();
      const minX = outerGeometry.boundingBox?.min.x || 0;
      const maxX = outerGeometry.boundingBox?.max.x || 0;
      width3D = maxX - minX;

      const outerCenter = new THREE.Vector3();
      outerGeometry.boundingBox?.getCenter(outerCenter);
      outerGeometry.translate(-outerCenter.x, -0.14, -outerCenter.z);

      NeonWord.outerGeometryCache[text] = outerGeometry;
      NeonWord.widthCache[text] = width3D;
    }

    if (!innerGeometry) {
      innerGeometry = new TextGeometry(text, {
        font: NeonWord.font,
        size: fontSize, // Ensure tracking exactly matches outerGeometry!
        depth: 0.052,
        curveSegments: 4, // Match outerGeometry to ensure identical curve bounds
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.003,
        bevelOffset: 0,
        bevelSegments: 1
      });
      
      innerGeometry.computeBoundingBox();
      const innerCenter = new THREE.Vector3();
      innerGeometry.boundingBox?.getCenter(innerCenter);
      innerGeometry.translate(-innerCenter.x, -0.14, -innerCenter.z);

      NeonWord.innerGeometryCache[text] = innerGeometry;
    }

    this.width3D = width3D;

    // Get glass texture from the generator
    const glassTexture = TextureGenerator.getGlassTexture();

    // Create materials
    this.material = new THREE.MeshStandardMaterial({
      color: this.neonColor,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.05,
      roughness: 0.3,
      metalness: 0.2,
      transparent: true,
      opacity: 0.95, // Increased opacity for better visibility
      map: glassTexture,
      roughnessMap: glassTexture,
      bumpMap: glassTexture,
      bumpScale: 0.02
    });

    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35 // Dim core when unlit (increased for visibility)
    });

    // 3. Physical brackets & rods
    const rodRadius = 0.012;
    const rodLength = this.width3D + 0.15;
    const rodGeometry = new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength, 6);
    rodGeometry.rotateZ(Math.PI / 2); // Make horizontal

    const supportMaterial = new THREE.MeshStandardMaterial({
      color: 0x16161a,
      roughness: 0.7,
      metalness: 0.8
    });

    const supportRod = new THREE.Mesh(rodGeometry, supportMaterial);
    supportRod.position.set(0, 0, -0.035);
    this.mesh.add(supportRod);

    // Pin connectors linking support rod to backing plate (reusing shared static geometry)
    const pinOffset = this.width3D * 0.35;
    const leftPin = new THREE.Mesh(NeonWord.supportPinGeometry, supportMaterial);
    leftPin.position.set(-pinOffset, 0, -0.035 - 0.05 / 2);
    this.mesh.add(leftPin);

    const rightPin = new THREE.Mesh(NeonWord.supportPinGeometry, supportMaterial);
    rightPin.position.set(pinOffset, 0, -0.035 - 0.05 / 2);
    this.mesh.add(rightPin);

    // 4. Assemble text meshes
    const outerMesh = new THREE.Mesh(outerGeometry, this.material);
    const innerMesh = new THREE.Mesh(innerGeometry, this.coreMaterial);
    innerMesh.position.z = 0.002;

    this.mesh.add(outerMesh);
    this.mesh.add(innerMesh);

    // Default unlit state
    this.setGlowState('unlit');
  }

  public getWidth3D(): number {
    return this.width3D;
  }

  /**
   * Exposed getters for materials to avoid using 'as any' casts in panel parent class
   */
  public get emissiveIntensity(): number {
    return this.material.emissiveIntensity;
  }

  public get emissiveColor(): THREE.Color {
    return this.material.emissive;
  }

  /**
   * Returns pre-cached world position vector to prevent frame allocations
   */
  public getWorldPosition(): THREE.Vector3 {
    return this.cachedWorldPosition;
  }

  /**
   * Updates the glow state of the neon word
   */
  public setGlowState(state: 'unlit' | 'lit' | 'flickering' | 'trailing', time = 0): void {
    if (this.glowState === state) return;
    
    if (state === 'flickering') {
      // Remember if we were trailing or lit to return to the correct state afterwards
      this.postFlickerState = this.glowState === 'trailing' ? 'trailing' : 'lit';
      this.flickerStartTime = time;
    }
    
    this.glowState = state;
    
    if (state === 'unlit') {
      this.material.emissive.setRGB(0, 0, 0);
      this.material.emissiveIntensity = 0.05;
      
      this.coreMaterial.color.setHex(0xffffff);
      this.coreMaterial.opacity = 0.35;
    } 
    else if (state === 'lit') {
      this.material.emissive.copy(this.neonColor);
      this.material.emissiveIntensity = 1.2; // Reduced glow intensity
      this.coreMaterial.opacity = 1.0;
    } 
    else if (state === 'trailing') {
      // Steady dim trailing glow that remains completely steady
      this.material.emissive.copy(this.neonColor);
      this.material.emissiveIntensity = 0.15;
      this.coreMaterial.opacity = 0.25;
    }
  }

  /**
   * Animation update: flickers when first transitioning to lit, and updates world position cache
   */
  public update(time: number, panelPosition: THREE.Vector3): void {
    // 1. Update cached world position for parent reference by adding panel world position to local position offset
    this.cachedWorldPosition.copy(this.mesh.position).add(panelPosition);

    // 2. Flicker animations
    if (this.glowState === 'flickering') {
      const elapsed = time - this.flickerStartTime;
      
      if (elapsed > this.flickerDuration) {
        // Return to the correct post-flicker state
        this.setGlowState(this.postFlickerState);
      } else {
        // High frequency electrical spark flicker
        const pulse = Math.sin(time * 85) * Math.cos(time * 50);
        if (pulse > -0.2) {
          this.material.emissive.copy(this.neonColor);
          
          if (this.postFlickerState === 'trailing') {
            // Proportional, low-intensity flicker for trailing words (boosted for visibility)
            this.material.emissiveIntensity = 0.15 + pulse * 0.30;
            this.coreMaterial.opacity = 0.25 + pulse * 0.20;
          } else {
            // Full bright active word flicker
            this.material.emissiveIntensity = 1.2 + pulse * 0.4;
            this.coreMaterial.opacity = 0.9 + pulse * 0.1;
          }
        } else {
          // Briefly drop out to unpowered state
          this.material.emissive.setRGB(0, 0, 0);
          
          if (this.postFlickerState === 'trailing') {
            this.material.emissiveIntensity = 0.05; // slightly darker dim
            this.coreMaterial.opacity = 0.15;
          } else {
            this.material.emissiveIntensity = 0.1;
            this.coreMaterial.opacity = 0.2;
          }
        }
      }
    }
  }

  public getIsFlickering(): boolean {
    return this.glowState === 'flickering';
  }

  public triggerFlicker(time: number): void {
    this.setGlowState('flickering', time);
  }

  public dispose(): void {
    const text = this.data.text;
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry !== NeonWord.supportPinGeometry &&
            child.geometry !== NeonWord.outerGeometryCache[text] &&
            child.geometry !== NeonWord.innerGeometryCache[text]) {
          child.geometry.dispose();
        }
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  public static disposeStaticCaches(): void {
    Object.keys(NeonWord.outerGeometryCache).forEach(key => {
      NeonWord.outerGeometryCache[key].dispose();
    });
    NeonWord.outerGeometryCache = {};

    Object.keys(NeonWord.innerGeometryCache).forEach(key => {
      NeonWord.innerGeometryCache[key].dispose();
    });
    NeonWord.innerGeometryCache = {};
    NeonWord.widthCache = {};
  }
}
