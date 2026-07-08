import * as THREE from 'three';

export interface BubbleParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  active: boolean;
}

export class BubbleSystem {
  public geometry: THREE.BufferGeometry;
  public mesh: THREE.Points;
  private pool: BubbleParticle[] = [];
  private maxBubbles: number;

  constructor(maxBubbles = 50) {
    this.maxBubbles = maxBubbles;
    this.geometry = new THREE.BufferGeometry();
    const bubblePositions = new Float32Array(this.maxBubbles * 3);
    
    // Initialize offscreen
    for (let i = 0; i < this.maxBubbles; i++) {
      bubblePositions[i * 3 + 2] = -999;
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));

    const bubbleMaterial = new THREE.PointsMaterial({
      color: 0xffeedd,
      size: 0.045,     // reduced size from 0.08 to 0.045 for a subtle effect
      transparent: true,
      opacity: 0.65,    // reduced opacity from 0.95 to 0.65
      blending: THREE.AdditiveBlending
    });

    this.mesh = new THREE.Points(this.geometry, bubbleMaterial);
    this.mesh.frustumCulled = false;

    // Initialize particle pool
    for (let i = 0; i < this.maxBubbles; i++) {
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
   * Animates active liquid bubbles.
   */
  public update(time: number, inActiveRange: boolean, currentProgress: number, width: number): void {
    const positions = this.geometry.attributes.position.array as Float32Array;

    // Reset positions
    for (let i = 0; i < this.maxBubbles; i++) {
      positions[i * 3 + 2] = -999;
    }

    const bracketWidth = 0.4;
    const L = width - bracketWidth * 2;
    const currentLength = currentProgress * L;

    // Count active bubbles
    let activeBubblesCount = 0;
    for (let i = 0; i < this.maxBubbles; i++) {
      if (this.pool[i].active) activeBubblesCount++;
    }

    const maxActiveBubbles = Math.round(currentProgress * this.maxBubbles);
    if (inActiveRange && currentProgress > 0 && currentProgress < 1 && Math.random() < 0.75) {
      if (activeBubblesCount < maxActiveBubbles) {
        let bubble = this.pool.find(b => !b.active);
        if (!bubble) {
          let oldestIndex = 0;
          let maxAgeDiff = -1;
          for (let i = 0; i < this.maxBubbles; i++) {
            const ageDiff = this.pool[i].age;
            if (ageDiff > maxAgeDiff) {
              maxAgeDiff = ageDiff;
              oldestIndex = i;
            }
          }
          bubble = this.pool[oldestIndex];
        }

        const spawnX = -L / 2 + Math.random() * currentLength;
        const angle = -Math.PI / 3.5 + Math.random() * (Math.PI * 2 / 3.5);
        const radius = 0.061 + Math.random() * 0.021;
        const spawnY = Math.sin(angle) * radius;
        const spawnZ = Math.cos(angle) * radius;

        bubble.pos.set(spawnX, spawnY, spawnZ);
        bubble.vel.set(
          (Math.random() - 0.5) * 0.003, // subtle wobble X
          0.003 + Math.random() * 0.004,  // gentle rise Y
          -Math.random() * 0.001          // drift slightly back towards core
        );
        bubble.age = 0;
        bubble.maxAge = 40 + Math.floor(Math.random() * 30);
        bubble.active = true;
      }
    }

    // Animate active bubbles
    for (let i = 0; i < this.maxBubbles; i++) {
      const b = this.pool[i];
      if (!b.active) continue;

      b.pos.add(b.vel);
      b.pos.x += Math.sin(time * 8 + i) * 0.001;
      b.pos.z += Math.cos(time * 8 + i) * 0.001;
      b.age++;

      const distFromCenter = Math.sqrt(b.pos.y * b.pos.y + b.pos.z * b.pos.z);
      const isOut = distFromCenter > 0.088 || b.pos.x < -L / 2 || b.pos.x > -L / 2 + currentLength;

      if (b.age < b.maxAge && !isOut) {
        positions[i * 3] = b.pos.x;
        positions[i * 3 + 1] = b.pos.y;
        positions[i * 3 + 2] = b.pos.z;
      } else {
        b.active = false;
      }
    }

    // Prune excess if liquid level dropped
    let currentActiveCount = 0;
    for (let i = 0; i < this.maxBubbles; i++) {
      const b = this.pool[i];
      if (b.active) {
        currentActiveCount++;
        if (currentActiveCount > maxActiveBubbles) {
          b.active = false;
          positions[i * 3 + 2] = -999;
        }
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
