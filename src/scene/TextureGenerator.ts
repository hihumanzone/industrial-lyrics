import * as THREE from 'three';

export interface PBRTextures {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  metalnessMap: THREE.CanvasTexture;
}

export class TextureGenerator {
  private static pbrTextures: PBRTextures | null = null;
  private static glassTexture: THREE.CanvasTexture | null = null;

  public static getPBRTextures(): PBRTextures {
    if (this.pbrTextures) return this.pbrTextures;

    const width = 1024;
    const height = 512;

    // Create canvases for PBR channels
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = width;
    colorCanvas.height = height;
    const colorCtx = colorCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = width;
    bumpCanvas.height = height;
    const bumpCtx = bumpCanvas.getContext('2d')!;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = width;
    roughCanvas.height = height;
    const roughCtx = roughCanvas.getContext('2d')!;

    const metalCanvas = document.createElement('canvas');
    metalCanvas.width = width;
    metalCanvas.height = height;
    const metalCtx = metalCanvas.getContext('2d')!;

    // Base fillings
    colorCtx.fillStyle = '#22201d';
    colorCtx.fillRect(0, 0, width, height);

    bumpCtx.fillStyle = '#808080'; // Neutral height
    bumpCtx.fillRect(0, 0, width, height);

    roughCtx.fillStyle = '#5c5a56'; // Medium-rough metal base (~0.36)
    roughCtx.fillRect(0, 0, width, height);

    metalCtx.fillStyle = '#e0e0e0'; // Highly metallic base (~0.88)
    metalCtx.fillRect(0, 0, width, height);

    // Fine metallic grain/noise on Color and Roughness
    const colorImg = colorCtx.getImageData(0, 0, width, height);
    const colorData = colorImg.data;
    const roughImg = roughCtx.getImageData(0, 0, width, height);
    const roughData = roughImg.data;

    for (let i = 0; i < colorData.length; i += 4) {
      const noise = (Math.random() - 0.5) * 12;
      colorData[i] = Math.max(0, Math.min(255, colorData[i] + noise));
      colorData[i + 1] = Math.max(0, Math.min(255, colorData[i + 1] + noise));
      colorData[i + 2] = Math.max(0, Math.min(255, colorData[i + 2] + noise));

      const rNoise = (Math.random() - 0.5) * 15;
      roughData[i] = Math.max(0, Math.min(255, roughData[i] + rNoise));
      roughData[i + 1] = Math.max(0, Math.min(255, roughData[i + 1] + rNoise));
      roughData[i + 2] = Math.max(0, Math.min(255, roughData[i + 2] + rNoise));
    }
    colorCtx.putImageData(colorImg, 0, 0);
    roughCtx.putImageData(roughImg, 0, 0);

    // Generate organic rust patches using overlapping blobs
    const rustPatches: { x: number; y: number; r: number; blobs: {dx: number; dy: number; dr: number}[] }[] = [];
    
    // Large structural patches
    for (let i = 0; i < 70; i++) {
      const numBlobs = 3 + Math.floor(Math.random() * 5);
      const blobs = [];
      const baseR = Math.random() * 25 + 10;
      for (let j = 0; j < numBlobs; j++) {
        blobs.push({
          dx: (Math.random() - 0.5) * baseR * 1.5,
          dy: (Math.random() - 0.5) * baseR * 1.5,
          dr: Math.random() * baseR * 0.8 + baseR * 0.4
        });
      }
      rustPatches.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: baseR,
        blobs: blobs
      });
    }

    // Small scattered rust fragments and speckles
    for (let i = 0; i < 180; i++) {
      const numBlobs = 1 + Math.floor(Math.random() * 2);
      const blobs = [];
      const baseR = Math.random() * 6 + 2;
      for (let j = 0; j < numBlobs; j++) {
        blobs.push({
          dx: (Math.random() - 0.5) * baseR * 0.5,
          dy: (Math.random() - 0.5) * baseR * 0.5,
          dr: Math.random() * baseR * 0.8 + baseR * 0.4
        });
      }
      rustPatches.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: baseR,
        blobs: blobs
      });
    }

    // Helper to draw seamless blobs
    const drawSeamlessBlob = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      r: number,
      createGradient: (gx: number, gy: number, gr: number) => CanvasGradient
    ) => {
      const offsets = [
        [0, 0], [width, 0], [-width, 0],
        [0, height], [0, -height],
        [width, height], [-width, -height],
        [width, -height], [-width, height]
      ];
      
      offsets.forEach(([ox, oy]) => {
        const bx = x + ox;
        const by = y + oy;
        if (bx + r > 0 && bx - r < width && by + r > 0 && by - r < height) {
          const grad = createGradient(bx, by, r);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };

    rustPatches.forEach(patch => {
      patch.blobs.forEach(blob => {
        const bx = patch.x + blob.dx;
        const by = patch.y + blob.dy;
        const br = blob.dr;

        // 1. Color: dark orange/brown corrosion gradients
        drawSeamlessBlob(colorCtx, bx, by, br, (gx, gy, gr) => {
          const grad = colorCtx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          grad.addColorStop(0, 'rgba(128, 48, 10, 0.85)');
          grad.addColorStop(0.5, 'rgba(92, 35, 12, 0.5)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          return grad;
        });

        // 2. Bump: rust has a slightly raised, rough grain
        drawSeamlessBlob(bumpCtx, bx, by, br, (gx, gy, gr) => {
          const bumpGrad = bumpCtx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          bumpGrad.addColorStop(0, 'rgba(150, 150, 150, 0.25)');
          bumpGrad.addColorStop(0.6, 'rgba(128, 128, 128, 0.05)');
          bumpGrad.addColorStop(1, 'rgba(128, 128, 128, 0)');
          return bumpGrad;
        });

        // 3. Roughness: rust is very matte and rough
        drawSeamlessBlob(roughCtx, bx, by, br, (gx, gy, gr) => {
          const roughGrad = roughCtx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          roughGrad.addColorStop(0, 'rgba(230, 230, 230, 0.8)');
          roughGrad.addColorStop(0.7, 'rgba(170, 170, 170, 0.3)');
          roughGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          return roughGrad;
        });

        // 4. Metalness: rust is non-metallic
        drawSeamlessBlob(metalCtx, bx, by, br, (gx, gy, gr) => {
          const metalGrad = metalCtx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          metalGrad.addColorStop(0, 'rgba(20, 20, 20, 0.85)');
          metalGrad.addColorStop(0.7, 'rgba(100, 100, 100, 0.3)');
          metalGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          return metalGrad;
        });
      });
    });

    // Generate crack fractal paths
    const crackPaths: { x: number; y: number }[][] = [];
    const numCracks = 30 + Math.floor(Math.random() * 15);
    for (let i = 0; i < numCracks; i++) {
      const startX = Math.random() * width;
      const startY = Math.random() * height;
      const length = Math.random() * 80 + 30;
      const angle = Math.random() * Math.PI * 2;
      
      const points: { x: number; y: number }[] = [];
      const generatePath = (x: number, y: number, len: number, ang: number, d: number) => {
        points.push({ x, y });
        if (d > 4) return;
        
        const segments = 4 + Math.floor(Math.random() * 5);
        let cx = x;
        let cy = y;
        for (let s = 0; s < segments; s++) {
          const stepLen = len / segments;
          ang += (Math.random() - 0.5) * 0.6;
          cx += Math.cos(ang) * stepLen;
          cy += Math.sin(ang) * stepLen;
          points.push({ x: cx, y: cy });

          // Branching cracks
          if (Math.random() < 0.15 && d < 2) {
            generatePath(cx, cy, len * 0.5, ang + (Math.random() - 0.5) * 1.5, d + 1);
          }
        }
      };
      
      generatePath(startX, startY, length, angle, 0);
      crackPaths.push(points);
    }

    crackPaths.forEach(path => {
      if (path.length < 2) return;

      const drawPath = (ctx: CanvasRenderingContext2D, color: string, w: number, ox = 0, oy = 0) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(path[0].x + ox, path[0].y + oy);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x + ox, path[i].y + oy);
        }
        ctx.stroke();
      };

      // Roughness: Cracks are matte and rough
      drawPath(roughCtx, '#c0c0c0', 4);

      // Metalness: Cracks are corroded
      drawPath(metalCtx, '#151515', 4);

      // Bump Map: dark groove + light edge highlight
      drawPath(bumpCtx, '#151515', 2.5);
      drawPath(bumpCtx, '#dfdfdf', 1.5, 1, 1);

      // Color Map: dark crack interior with rust border
      drawPath(colorCtx, 'rgba(85, 30, 8, 0.6)', 5.5); // rust staining
      drawPath(colorCtx, '#080706', 2.5); // crack interior
      drawPath(colorCtx, 'rgba(255, 140, 60, 0.2)', 1.2, 1, 1); // edge reflection highlight
    });

    // Fine scratches
    for (let i = 0; i < 120; i++) {
      const startX = Math.random() * width;
      const startY = Math.random() * height;
      const lengthX = Math.random() * 50 - 25;
      const lengthY = Math.random() * 8 - 4;

      // Color
      colorCtx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      colorCtx.lineWidth = 1.2;
      colorCtx.beginPath();
      colorCtx.moveTo(startX, startY);
      colorCtx.lineTo(startX + lengthX, startY + lengthY);
      colorCtx.stroke();
      
      // Bump map for deep scratches
      bumpCtx.strokeStyle = 'rgba(220, 220, 220, 0.4)';
      bumpCtx.lineWidth = 1.0;
      bumpCtx.beginPath();
      bumpCtx.moveTo(startX, startY);
      bumpCtx.lineTo(startX + lengthX, startY + lengthY);
      bumpCtx.stroke();
      
      // Roughness (shiny scratch center)
      roughCtx.strokeStyle = 'rgba(100, 100, 100, 0.6)';
      roughCtx.lineWidth = 1.0;
      roughCtx.beginPath();
      roughCtx.moveTo(startX, startY);
      roughCtx.lineTo(startX + lengthX, startY + lengthY);
      roughCtx.stroke();
    }

    const texScaleX = 0.15;
    const texScaleY = 0.3;

    const rustTexture = new THREE.CanvasTexture(colorCanvas);
    rustTexture.wrapS = THREE.RepeatWrapping;
    rustTexture.wrapT = THREE.RepeatWrapping;
    rustTexture.repeat.set(texScaleX, texScaleY);

    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    bumpTexture.wrapS = THREE.RepeatWrapping;
    bumpTexture.wrapT = THREE.RepeatWrapping;
    bumpTexture.repeat.set(texScaleX, texScaleY);

    const roughnessTexture = new THREE.CanvasTexture(roughCanvas);
    roughnessTexture.wrapS = THREE.RepeatWrapping;
    roughnessTexture.wrapT = THREE.RepeatWrapping;
    roughnessTexture.repeat.set(texScaleX, texScaleY);

    const metalnessTexture = new THREE.CanvasTexture(metalCanvas);
    metalnessTexture.wrapS = THREE.RepeatWrapping;
    metalnessTexture.wrapT = THREE.RepeatWrapping;
    metalnessTexture.repeat.set(texScaleX, texScaleY);

    this.pbrTextures = {
      map: rustTexture,
      bumpMap: bumpTexture,
      roughnessMap: roughnessTexture,
      metalnessMap: metalnessTexture
    };

    return this.pbrTextures;
  }


  public static getGlassTexture(): THREE.CanvasTexture {
    if (this.glassTexture) return this.glassTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    // Fill base
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    
    const imgData = ctx.getImageData(0, 0, 256, 256);
    const data = imgData.data;
    
    // Add subtle noise texture
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 30; // subtle variation
      const val = Math.max(0, Math.min(255, 230 + noise));
      data[i] = val;     // R
      data[i+1] = val;   // G
      data[i+2] = val;   // B
      data[i+3] = 255;   // Alpha
    }
    
    ctx.putImageData(imgData, 0, 0);
    
    this.glassTexture = new THREE.CanvasTexture(canvas);
    this.glassTexture.wrapS = THREE.RepeatWrapping;
    this.glassTexture.wrapT = THREE.RepeatWrapping;
    this.glassTexture.repeat.set(2, 2);

    return this.glassTexture;
  }

  private static materialPool: PBRMaterialPool | null = null;

  public static getMaterialPool(): PBRMaterialPool {
    if (this.materialPool) return this.materialPool;

    const textures = this.getPBRTextures();
    const poolSize = 12;
    const plateMaterials: THREE.MeshStandardMaterial[] = [];
    const slabMaterials: THREE.MeshStandardMaterial[] = [];

    for (let i = 0; i < poolSize; i++) {
      const uvOffsetX = Math.random();
      const uvOffsetY = Math.random();

      const plateMap = textures.map.clone();
      plateMap.offset.set(uvOffsetX, uvOffsetY);
      plateMap.needsUpdate = true;

      const plateBumpMap = textures.bumpMap.clone();
      plateBumpMap.offset.set(uvOffsetX, uvOffsetY);
      plateBumpMap.needsUpdate = true;

      const plateRoughnessMap = textures.roughnessMap.clone();
      plateRoughnessMap.offset.set(uvOffsetX, uvOffsetY);
      plateRoughnessMap.needsUpdate = true;

      const plateMetalnessMap = textures.metalnessMap.clone();
      plateMetalnessMap.offset.set(uvOffsetX, uvOffsetY);
      plateMetalnessMap.needsUpdate = true;

      const plateMaterial = new THREE.MeshStandardMaterial({
        map: plateMap,
        bumpMap: plateBumpMap,
        bumpScale: 0.06,
        roughnessMap: plateRoughnessMap,
        metalnessMap: plateMetalnessMap,
        roughness: 1.0,
        metalness: 1.0,
        color: 0xffffff
      });

      plateMaterial.userData = {
        originalBumpMap: plateBumpMap,
        originalRoughnessMap: plateRoughnessMap,
        originalMetalnessMap: plateMetalnessMap
      };
      plateMaterials.push(plateMaterial);

      const slabOffsetX = Math.random();
      const slabOffsetY = Math.random();

      const slabMap = textures.map.clone();
      slabMap.offset.set(slabOffsetX, slabOffsetY);
      slabMap.needsUpdate = true;

      const slabBumpMap = textures.bumpMap.clone();
      slabBumpMap.offset.set(slabOffsetX, slabOffsetY);
      slabBumpMap.needsUpdate = true;

      const slabRoughnessMap = textures.roughnessMap.clone();
      slabRoughnessMap.offset.set(slabOffsetX, slabOffsetY);
      slabRoughnessMap.needsUpdate = true;

      const slabMetalnessMap = textures.metalnessMap.clone();
      slabMetalnessMap.offset.set(slabOffsetX, slabOffsetY);
      slabMetalnessMap.needsUpdate = true;

      const slabMaterial = new THREE.MeshStandardMaterial({
        map: slabMap,
        bumpMap: slabBumpMap,
        bumpScale: 0.06,
        roughnessMap: slabRoughnessMap,
        metalnessMap: slabMetalnessMap,
        roughness: 1.0,
        metalness: 1.0,
        color: 0xcccccc
      });

      slabMaterial.userData = {
        originalBumpMap: slabBumpMap,
        originalRoughnessMap: slabRoughnessMap,
        originalMetalnessMap: slabMetalnessMap
      };
      slabMaterials.push(slabMaterial);
    }

    this.materialPool = { plateMaterials, slabMaterials };
    return this.materialPool;
  }

  public static disposeSharedAssets(): void {
    if (this.pbrTextures) {
      this.pbrTextures.map.dispose();
      this.pbrTextures.bumpMap.dispose();
      this.pbrTextures.roughnessMap.dispose();
      this.pbrTextures.metalnessMap.dispose();
      this.pbrTextures = null;
    }
    if (this.glassTexture) {
      this.glassTexture.dispose();
      this.glassTexture = null;
    }
    if (this.materialPool) {
      this.materialPool.plateMaterials.forEach(mat => {
        mat.dispose();
        if (mat.map) mat.map.dispose();
        if (mat.userData.originalBumpMap) mat.userData.originalBumpMap.dispose();
        if (mat.userData.originalRoughnessMap) mat.userData.originalRoughnessMap.dispose();
        if (mat.userData.originalMetalnessMap) mat.userData.originalMetalnessMap.dispose();
      });
      this.materialPool.slabMaterials.forEach(mat => {
        mat.dispose();
        if (mat.map) mat.map.dispose();
        if (mat.userData.originalBumpMap) mat.userData.originalBumpMap.dispose();
        if (mat.userData.originalRoughnessMap) mat.userData.originalRoughnessMap.dispose();
        if (mat.userData.originalMetalnessMap) mat.userData.originalMetalnessMap.dispose();
      });
      this.materialPool = null;
    }
  }
}

export interface PBRMaterialPool {
  plateMaterials: THREE.MeshStandardMaterial[];
  slabMaterials: THREE.MeshStandardMaterial[];
}
