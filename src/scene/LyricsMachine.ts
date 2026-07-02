import * as THREE from 'three';
import { ParsedLyrics } from '../types/lyrics';
import { LyricPanel } from './LyricPanel';
import { NeonWord } from './NeonWord';
import { Atmosphere } from './Atmosphere';
import { CameraRig } from './CameraRig';
import { getSyncState } from '../lib/sync';
import { TextureGenerator } from './TextureGenerator';
import { BgImageStorage } from '../lib/file';

export class LyricsMachine {
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  
  private atmosphere!: Atmosphere;
  private cameraRig!: CameraRig;
  private timer = new THREE.Timer();

  // Panels list
  private panels: LyricPanel[] = [];
  private parsedLyrics: ParsedLyrics | null = null;
  private currentAudioTime = 0;

  // High-precision audio timeline estimation
  private audio: HTMLAudioElement | null = null;
  private lastSyncTime = 0;
  private lastAudioTime = 0;
  private lastSeenAudioTime = 0;
  
  // Animation state
  private activeIndex = -1;
  private isReducedMotion = false;
  private isLowPerformance = false;
  private isFallbackView = false;
  private isLockedResolution = false;
  private animationFrameId: number | null = null;
  private bgTexture: THREE.CanvasTexture | null = null;

  // Reusable glow sources array to prevent array allocation on every frame
  private glowSources: { color: THREE.Color; intensity: number; position: THREE.Vector3; width: number; isTrailing: boolean; isPause?: boolean; progress?: number }[] = [];

  constructor(canvasId: string, audio?: HTMLAudioElement) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error(`Canvas element with ID '${canvasId}' not found.`);
    }
    if (audio) {
      this.audio = audio;
    }

    this.initThree();
    this.initControllers();
    this.initResizeHandler();
    this.initBgUpdateListener();
    this.initBackgroundFromStorage();
    this.timer.connect(document);
    this.startLoop();
  }

  private initThree(): void {
    // 1. Scene
    this.scene = new THREE.Scene();

    // 2. Camera & dimensions
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    
    // 3. WebGLRenderer with performance parameters
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isLowPerformance,
      powerPreference: 'high-performance',
      alpha: true,
      stencil: false,
      depth: true
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false; // Disable shadows for standard performance
  }

  private initControllers(): void {
    this.atmosphere = new Atmosphere(this.scene);
    this.cameraRig = new CameraRig(this.camera);
  }

  private handleResize = (): void => {
    if (this.isLockedResolution) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };

  private initResizeHandler(): void {
    window.addEventListener('resize', this.handleResize);
  }

  private initBgUpdateListener(): void {
    window.addEventListener('bg-update', this.handleBgUpdate);
  }

  private handleBgUpdate = (e: Event): void => {
    const customEvent = e as CustomEvent<{ file: File | null; darkness: number; blur: number }>;
    const { file, darkness, blur } = customEvent.detail;
    this.updateBackground(file, darkness, blur);
  };

  private async initBackgroundFromStorage(): Promise<void> {
    try {
      const storage = new BgImageStorage();
      const file = await storage.loadImage();
      
      const savedDarkness = localStorage.getItem('lyrics-bg-darkness');
      const savedBlur = localStorage.getItem('lyrics-bg-blur');

      const darkness = savedDarkness !== null ? parseInt(savedDarkness, 10) : 60;
      const blur = savedBlur !== null ? parseInt(savedBlur, 10) : 15;

      await this.updateBackground(file, darkness, blur);
    } catch (err) {
      console.error('Failed to initialize background from storage in LyricsMachine:', err);
    }
  }

  public lockResolution(width: number, height: number): void {
    this.isLockedResolution = true;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  public unlockResolution(): void {
    this.isLockedResolution = false;
    this.handleResize();
  }

  private startLoop(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      this.render();
    };
    animate();
  }

  private render(): void {
    this.timer.update();
    const elapsed = this.timer.getElapsed();

    // Estimate playback time with high-precision interpolation (60fps) to avoid missing short word ranges
    if (this.audio) {
      const actualTime = this.audio.currentTime;
      const paused = this.audio.paused;
      const now = performance.now();

      if (actualTime !== this.lastSeenAudioTime) {
        this.lastAudioTime = actualTime;
        this.lastSyncTime = now;
        this.lastSeenAudioTime = actualTime;
      }

      if (paused) {
        this.currentAudioTime = actualTime;
      } else {
        const frameElapsed = (now - this.lastSyncTime) / 1000;
        const estimate = this.lastAudioTime + frameElapsed;
        // Resync if estimate drifts by more than 0.3s (e.g. background tab or system stutter)
        if (Math.abs(estimate - actualTime) > 0.3) {
          this.lastSyncTime = now;
          this.lastAudioTime = actualTime;
          this.currentAudioTime = actualTime;
        } else {
          this.currentAudioTime = estimate;
        }
      }
    }

    // 1. Sync calculations
    let activeLineText = '...';
    let inLineBounds = false;

    if (this.parsedLyrics && this.parsedLyrics.lines.length > 0) {
      const syncState = getSyncState(this.parsedLyrics.lines, this.currentAudioTime);
      this.activeIndex = syncState.activeLineIndex;
      inLineBounds = syncState.inLineBounds;
      
      if (syncState.activeLine) {
        if (syncState.activeLine.isPause) {
          const duration = syncState.activeLine.endTime - syncState.activeLine.startTime;
          const progress = duration > 0 ? Math.max(0, Math.min(1, (this.currentAudioTime - syncState.activeLine.startTime) / duration)) : 0;
          const barLength = 15;
          const filledLength = Math.round(progress * barLength);
          const emptyLength = barLength - filledLength;
          const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
          activeLineText = `[Instrumental] ${bar}`;
        } else {
          activeLineText = syncState.activeLine.text;
        }
      }
    }

    // Accessibility Fallback update
    const fallbackEl = document.getElementById('fallback-current-line');
    if (fallbackEl) {
      fallbackEl.textContent = activeLineText;
    }

    // Adjust ease factor if reduced-motion is enabled
    const lerpSpeed = this.isReducedMotion ? 0.35 : 0.08;

    // 2. Animate panels and determine light color
    this.glowSources.length = 0; // Clear reuse array

    // Consistent gap between adjacent panels (edge-to-edge)
    const panelGap = 0.8;

    for (let i = 0; i < this.panels.length; i++) {
      const panel = this.panels[i];

      // Cull panels that are far from the viewport to save draw calls
      const offsetFromActive = i - this.activeIndex;
      const isVisible = Math.abs(offsetFromActive) <= 4;
      
      panel.group.visible = isVisible && !this.isFallbackView;
      panel.armature.group.visible = isVisible && !this.isFallbackView;

      if (isVisible) {
        // Calculate targets
        if (i === this.activeIndex) {
          // Centered active panel: pull closer to camera in Z
          panel.targetPosition.set(0, 0, inLineBounds ? 1.8 : 0.8);
        } else {
          // Inactive panel: push deep into fog, stack in Y with dynamic spacing.
          // Accumulate Y offset by walking from the active panel to this panel,
          // summing each intermediate panel's half-height plus the gap.
          let yOffset = 0;
          const step_dir = offsetFromActive > 0 ? 1 : -1; // walk direction through indices

          for (let step = 1; step <= Math.abs(offsetFromActive); step++) {
            const prevIdx = this.activeIndex + step_dir * (step - 1);
            const currIdx = this.activeIndex + step_dir * step;
            const prevPanel = this.panels[prevIdx];
            const currPanel = this.panels[currIdx];
            if (prevPanel && currPanel) {
              yOffset += prevPanel.height / 2 + panelGap + currPanel.height / 2;
            } else {
              yOffset += 1.8; // fallback
            }
          }

          // Panels above active (offsetFromActive < 0) go up (+Y),
          // panels below active (offsetFromActive > 0) go down (-Y)
          panel.targetPosition.set(
            -0.8,
            -step_dir * yOffset,
            -3.5
          );
        }

        // Apply physical update and internal state changes FIRST
        panel.update(elapsed, this.currentAudioTime, this.activeIndex, lerpSpeed);

        if (i === this.activeIndex) {
          // Query glowing word info for global atmospheric flicker reflections AFTER update
          // so it captures the new states and up-to-date interpolated positions
          panel.getWordGlowSources(this.glowSources);
        }
      }
    }

    // 3. Update atmosphere reflections & camera position
    if (!this.isFallbackView) {
      this.atmosphere.update(elapsed, this.glowSources);
      
      // Update camera focus height based on Y offset of active panel
      // (Since active panel is centered at Y=0, look at 0, but camera adjusts focus)
      this.cameraRig.setTargetY(0);
      this.cameraRig.update(elapsed);

      // Render WebGL
      this.renderer.render(this.scene, this.camera);
    } else {
      // Clear renderer to save CPU/GPU if 2D view is forced
      this.renderer.clear();
    }
  }

  /**
   * Loads new lyrics, rebuilding all 3D panels and armatures.
   */
  public setLyrics(lyrics: ParsedLyrics): void {
    this.clearLyrics();
    this.parsedLyrics = lyrics;

    // Precompute line repetition
    const lineCounts = new Map<string, number>();
    for (const line of lyrics.lines) {
      const text = line.text.trim();
      lineCounts.set(text, (lineCounts.get(text) || 0) + 1);
    }

    // Generate new panels
    const generatedPanels: LyricPanel[] = [];
    for (let idx = 0; idx < lyrics.lines.length; idx++) {
      const line = lyrics.lines[idx];
      const text = line.text.trim();
      const isRepeated = (lineCounts.get(text) || 0) > 1;
      const panel = new LyricPanel(line, idx, isRepeated);
      
      // Setup initial stacked positions in Y with dynamic spacing
      const initGap = 0.8;
      let initialY = 0;
      if (idx > 0) {
        const prevPanel = generatedPanels[idx - 1];
        initialY = prevPanel.currentPosition.y - prevPanel.height / 2 - initGap - panel.height / 2;
      }
      panel.currentPosition.set(-0.8, initialY, -5.0);
      panel.targetPosition.copy(panel.currentPosition);
      panel.group.position.copy(panel.currentPosition);
      
      // Add components to the scene
      this.scene.add(panel.group);
      this.scene.add(panel.armature.group);

      // Pass down performance state
      panel.setLowPerformance(this.isLowPerformance);

      generatedPanels.push(panel);
    }
    this.panels = generatedPanels;

    this.activeIndex = -1;
    this.snapToTargetPositions();
  }

  /**
   * Cleans up all 3D meshes, textures, and armatures in the scene.
   */
  public clearLyrics(): void {
    this.panels.forEach((panel) => {
      this.scene.remove(panel.group);
      this.scene.remove(panel.armature.group);
      panel.dispose();
    });
    this.panels = [];
    this.parsedLyrics = null;
    this.activeIndex = -1;
  }

  /**
   * Snaps all lyric panels instantly to their target coordinates based on the current playback time.
   * This prevents physical sliding and shuffling animations when performing manual seek/jump operations.
   */
  public snapToTargetPositions(): void {
    if (!this.parsedLyrics || this.panels.length === 0) return;

    const syncState = getSyncState(this.parsedLyrics.lines, this.currentAudioTime);
    this.activeIndex = syncState.activeLineIndex;
    const inLineBounds = syncState.inLineBounds;
    const panelGap = 0.8;

    for (let i = 0; i < this.panels.length; i++) {
      const panel = this.panels[i];
      const offsetFromActive = i - this.activeIndex;

      if (i === this.activeIndex) {
        panel.targetPosition.set(0, 0, inLineBounds ? 1.8 : 0.8);
      } else {
        let yOffset = 0;
        const step_dir = offsetFromActive > 0 ? 1 : -1;

        for (let step = 1; step <= Math.abs(offsetFromActive); step++) {
          const prevIdx = this.activeIndex + step_dir * (step - 1);
          const currIdx = this.activeIndex + step_dir * step;
          const prevPanel = this.panels[prevIdx];
          const currPanel = this.panels[currIdx];
          if (prevPanel && currPanel) {
            yOffset += prevPanel.height / 2 + panelGap + currPanel.height / 2;
          } else {
            yOffset += 1.8;
          }
        }

        panel.targetPosition.set(
          -0.8,
          -step_dir * yOffset,
          -3.5
        );
      }

      // Instant snap
      panel.currentPosition.copy(panel.targetPosition);
      panel.group.position.copy(panel.currentPosition);
      panel.group.updateMatrixWorld(true);
    }
  }

  /**
   * Performs a seek operation, updating current time, resetting high-precision estimation,
   * and snapping all panels immediately to prevent shuffling artifacts.
   */
  public seek(time: number): void {
    this.currentAudioTime = time;
    this.lastAudioTime = time;
    this.lastSeenAudioTime = time;
    this.lastSyncTime = performance.now();
    this.snapToTargetPositions();
  }

  /**
   * Updates playback time of the viewer
   */
  public updateTime(currentTime: number): void {
    this.currentAudioTime = currentTime;
  }

  /**
   * Preferences sync toggles
   */
  public setReducedMotion(enabled: boolean): void {
    this.isReducedMotion = enabled;
    this.cameraRig.setReducedMotion(enabled);
  }

  public setLowPerformance(enabled: boolean): void {
    this.isLowPerformance = enabled;
    this.atmosphere.setLowPerformance(enabled);
    this.cameraRig.setLowPerformance(enabled);
    
    // Adjust antialiasing post-creation
    if (enabled) {
      this.renderer.setPixelRatio(1);
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    
    // Sync existing panels
    this.panels.forEach(p => p.setLowPerformance(enabled));
  }

  public setFallbackView(enabled: boolean): void {
    this.isFallbackView = enabled;
    
    const canvasEl = this.renderer.domElement;
    if (enabled) {
      canvasEl.style.display = 'none';
    } else {
      canvasEl.style.display = 'block';
    }
  }

  public async updateBackground(file: File | null, darkness: number, blur: number): Promise<void> {
    if (!file) {
      this.scene.background = null;
      if (this.bgTexture) {
        this.bgTexture.dispose();
        this.bgTexture = null;
      }
      return;
    }

    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load background image'));
      });

      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      const maxDimension = 1024;
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const brightness = (1 - darkness / 100).toFixed(2);
      ctx.filter = `blur(${blur}px) brightness(${brightness})`;

      const padding = blur * 2;
      ctx.drawImage(
        img,
        -padding,
        -padding,
        width + padding * 2,
        height + padding * 2
      );

      if (this.bgTexture) {
        this.bgTexture.dispose();
      }

      this.bgTexture = new THREE.CanvasTexture(canvas);
      this.bgTexture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = this.bgTexture;
    } catch (err) {
      console.error('Error updating scene background:', err);
    }
  }

  public dispose(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('bg-update', this.handleBgUpdate);

    if (this.bgTexture) {
      this.bgTexture.dispose();
      this.bgTexture = null;
    }
    
    this.clearLyrics();
    this.atmosphere.dispose();
    this.renderer.dispose();
    this.timer.disconnect();
    this.timer.dispose();
    TextureGenerator.disposeSharedAssets();
    LyricPanel.disposeStaticCaches();
    NeonWord.disposeStaticCaches();
  }
}
