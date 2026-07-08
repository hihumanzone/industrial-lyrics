import * as THREE from 'three';

export interface SparkParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  active: boolean;
}

export class SparkSystem {
  public geometry: THREE.BufferGeometry;
  public mesh: THREE.Points;
  private pool: SparkParticle[] = [];
  private maxSparks: number;

  constructor(maxSparks = 60) {
    this.maxSparks = maxSparks;
    this.geometry = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(this.maxSparks * 3);
    
    // Initialize offscreen
    for (let i = 0; i < this.maxSparks; i++) {
      sparkPositions[i * 3 + 2] = -999;
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));

    const sparkMaterial = new THREE.PointsMaterial({
      color: 0xff8833,
      size: 0.05,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.95
    });

    this.mesh = new THREE.Points(this.geometry, sparkMaterial);
    this.mesh.frustumCulled = false;

    // Initialize particle pool
    for (let i = 0; i < this.maxSparks; i++) {
      this.pool.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        maxAge: 0,
        active: false
      });
    }
  }

  /**
   * Triggers a burst of spark particles.
   * Expects local coordinate space position.
   */
  public emit(localPos: THREE.Vector3, count: number): void {
    for (let c = 0; c < count; c++) {
      let spark = this.pool.find(s => !s.active);
      if (!spark) {
        // Overwrite the oldest active spark
        let oldestIndex = 0;
        let maxAgeDiff = -1;
        for (let i = 0; i < this.maxSparks; i++) {
          const ageDiff = this.pool[i].age;
          if (ageDiff > maxAgeDiff) {
            maxAgeDiff = ageDiff;
            oldestIndex = i;
          }
        }
        spark = this.pool[oldestIndex];
      }

      spark.pos.copy(localPos);
      spark.vel.set(
        (Math.random() - 0.5) * 0.08,
        Math.random() * 0.15,
        (Math.random() - 0.5) * 0.08 + 0.08
      );
      spark.age = 0;
      spark.maxAge = 25 + Math.floor(Math.random() * 25);
      spark.active = true;
    }
  }

  /**
   * Animates active sparks under gravity and drag.
   */
  public update(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;

    // Reset positions
    for (let i = 0; i < this.maxSparks; i++) {
      positions[i * 3 + 2] = -999;
    }

    // Animate active sparks
    for (let i = 0; i < this.maxSparks; i++) {
      const s = this.pool[i];
      if (!s.active) continue;

      s.pos.add(s.vel);
      s.vel.y -= 0.006; // gravity
      s.vel.x *= 0.98;  // drag
      s.vel.z *= 0.98;
      s.age++;

      if (s.age < s.maxAge) {
        positions[i * 3] = s.pos.x;
        positions[i * 3 + 1] = s.pos.y;
        positions[i * 3 + 2] = s.pos.z;
      } else {
        s.active = false;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  public dispose(): void {
    this.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(m => m.dispose());
    } else {
      this.mesh.material.dispose();
    }
  }
}
