import * as THREE from 'three';

export class Atmosphere {
  private scene: THREE.Scene;
  
  // Lights
  private ambientLight!: THREE.AmbientLight;
  private spotlight!: THREE.SpotLight;
  private neonFlickerLights: THREE.PointLight[] = [];
  
  // Particles
  private dustParticles!: THREE.Points;
  private particleGeometry!: THREE.BufferGeometry;
  private particleCount = 150;
  private particleSpeed = 0.05;

  private isLowPerformance = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    this.initFog();
    this.initLights();
    this.initDust();
  }

  private initFog(): void {
    // Deep dark industrial fog
    this.scene.fog = new THREE.FogExp2(0x08080a, 0.025);
  }

  private initLights(): void {
    // Dim ambient base
    this.ambientLight = new THREE.AmbientLight(0x0d0d12, 1.2);
    this.scene.add(this.ambientLight);

    // Spotlight focusing on the active panel area (around X=0, Y=0, Z=2)
    this.spotlight = new THREE.SpotLight(0xffaa88, 12, 35, Math.PI / 4, 0.5, 1);
    this.spotlight.position.set(5, 8, 12);
    this.spotlight.target.position.set(0, 0, 1);
    this.scene.add(this.spotlight);
    this.scene.add(this.spotlight.target);

    // Distributed neon point lights pool distributed across active and trailing words
    for (let i = 0; i < 12; i++) {
      const light = new THREE.PointLight(0xff6e28, 0, 7, 2);
      this.neonFlickerLights.push(light);
      this.scene.add(light);
    }
  }

  private initDust(): void {
    this.particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const velocities: number[] = [];

    for (let i = 0; i < this.particleCount; i++) {
      // Spread dust particles around the main camera viewport
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
      
      velocities.push((Math.random() * 0.5 + 0.5) * this.particleSpeed);
    }

    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleGeometry.userData = { velocities };

    // Simple custom circular particle material
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x8a8a9a,
      size: 0.08,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });

    this.dustParticles = new THREE.Points(this.particleGeometry, particleMaterial);
    this.scene.add(this.dustParticles);
  }

  public update(time: number, glowSources: { color: THREE.Color; intensity: number; position: THREE.Vector3; width: number; isTrailing: boolean; isPause?: boolean; progress?: number }[]): void {
    // 1. Particle Drift
    if (!this.isLowPerformance) {
      const positions = this.particleGeometry.attributes.position.array as Float32Array;
      const velocities = this.particleGeometry.userData.velocities as number[];

      for (let i = 0; i < this.particleCount; i++) {
        // Move particle up in Y-axis
        positions[i * 3 + 1] += velocities[i] * 0.1;
        // Subtle drift in X-axis
        positions[i * 3] += Math.sin(time + i) * 0.002;

        // Wrap around bounds
        if (positions[i * 3 + 1] > 6) {
          positions[i * 3 + 1] = -6;
        }
      }
      this.particleGeometry.attributes.position.needsUpdate = true;
    }

    // Lerp speeds for smooth light fade in/out and movement transitions
    const intensityLerpSpeed = 0.15;
    const positionLerpSpeed = 0.2;

    // Reset target intensities to 0
    this.neonFlickerLights.forEach(light => {
      if (light.userData.targetIntensity === undefined) {
        light.userData.targetIntensity = 0;
        light.userData.targetPosition = new THREE.Vector3().copy(light.position);
        light.userData.targetColor = new THREE.Color().copy(light.color);
      } else {
        light.userData.targetIntensity = 0;
      }
    });

    let lightIndex = 0;

    glowSources.forEach(source => {
      if (source.isTrailing) {
        // In low performance mode, skip trailing lights to save draw calls
        if (this.isLowPerformance) return;

        // Trailing word: allocate 1 PointLight in its center
        if (lightIndex < this.neonFlickerLights.length) {
          const light = this.neonFlickerLights[lightIndex++];
          light.userData.isInterpolated = false;
          light.userData.targetColor.copy(source.color);
          light.userData.targetPosition.copy(source.position);
          light.userData.targetPosition.z -= 0.035; // Behind the letters
          light.userData.targetIntensity = source.intensity * 2.2;
          light.distance = 4.5;
        }
      } else if (source.isPause) {
        // Active pause progress core: distribute multiple lights for a uniform glow line
        const maxCount = this.isLowPerformance ? 3 : 6;
        const count = Math.max(1, Math.round((source.progress ?? 1.0) * maxCount));
        
        for (let k = 0; k < count; k++) {
          if (lightIndex < this.neonFlickerLights.length) {
            const light = this.neonFlickerLights[lightIndex++];
            light.userData.isInterpolated = true;
            light.userData.targetColor.copy(source.color);
            light.userData.targetPosition.copy(source.position);
            
            // Distribute evenly across 90% of the liquid column width
            const ratio = count > 1 ? (k / (count - 1)) - 0.5 : 0;
            light.userData.targetPosition.x += ratio * 0.9 * source.width;
            light.userData.targetPosition.z -= 0.035;
            
            light.userData.targetIntensity = (source.intensity * 5.0) / count;
            light.distance = 7.0;
          }
        }
      } else {
        // Active word: allocate 3 distributed lights (or 1 in center if low performance)
        if (this.isLowPerformance) {
          if (lightIndex < this.neonFlickerLights.length) {
            const light = this.neonFlickerLights[lightIndex++];
            light.userData.isInterpolated = false;
            light.userData.targetColor.copy(source.color);
            light.userData.targetPosition.copy(source.position);
            light.userData.targetPosition.z -= 0.035;
            light.userData.targetIntensity = source.intensity * 3.5;
            light.distance = 7.0;
          }
        } else {
          const offsets = [-0.35, 0, 0.35];
          offsets.forEach(offset => {
            if (lightIndex < this.neonFlickerLights.length) {
              const light = this.neonFlickerLights[lightIndex++];
              light.userData.isInterpolated = false;
              light.userData.targetColor.copy(source.color);
              light.userData.targetPosition.copy(source.position);
              light.userData.targetPosition.x += offset * source.width;
              light.userData.targetPosition.z -= 0.035;
              
              light.userData.targetIntensity = (source.intensity * 5.0) / 3;
              light.distance = 7.0;
            }
          });
        }
      }
    });

    // Apply actual light properties (smoothly interpolate for pause line, instant for words)
    this.neonFlickerLights.forEach(light => {
      if (light.userData.isInterpolated) {
        // Lerp intensity towards target (either 0 if unused/de-allocated, or its computed target intensity)
        light.intensity += (light.userData.targetIntensity - light.intensity) * intensityLerpSpeed;
        // Lerp position towards target position
        light.position.lerp(light.userData.targetPosition, positionLerpSpeed);
        // Lerp color towards target color
        light.color.lerp(light.userData.targetColor, intensityLerpSpeed);
      } else {
        // Instant application for sharp neon word flickering
        light.intensity = light.userData.targetIntensity;
        light.position.copy(light.userData.targetPosition);
        light.color.copy(light.userData.targetColor);
      }
    });
  }

  /**
   * Settings toggles
   */
  public setLowPerformance(enabled: boolean): void {
    this.isLowPerformance = enabled;
    
    // Reduce particle count or hide entirely
    if (enabled) {
      this.dustParticles.visible = false;
      this.spotlight.intensity = 5;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.density = 0.015; // lighter fog for lower cost shader
      }
    } else {
      this.dustParticles.visible = true;
      this.spotlight.intensity = 12;
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.density = 0.025;
      }
    }
  }

  public dispose(): void {
    this.particleGeometry.dispose();
    if (Array.isArray(this.dustParticles.material)) {
      this.dustParticles.material.forEach(m => m.dispose());
    } else {
      this.dustParticles.material.dispose();
    }
  }
}
