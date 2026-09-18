import * as THREE from 'three';

export class CameraRig {
  private camera: THREE.PerspectiveCamera;
  
  // Position targets
  private targetPosition = new THREE.Vector3(0, 0, 8.5);
  private targetLookAt = new THREE.Vector3(0, 0, 0);
  
  private currentLookAt = new THREE.Vector3(0, 0, 0);
  
  private isLowPerformance = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.position.set(0, 0, 15); // Start pulled back
  }

  /**
   * Sets the visual target Y coordinate corresponding to the active panel position
   */
  public setTargetY(activeY: number): void {
    // When panels move, the camera pivots or shifts slightly to focus on the active panel
    // Keep camera at y=0 or slightly offset, and let it look at the active panel's center
    this.targetLookAt.set(0, activeY, 1.5);
    
    // Position the camera slightly above/tilted relative to the panel
    // Target position is offset in Y relative to the active lyric
    this.targetPosition.set(0.3, activeY + 0.2, 7.8);
  }

  /**
   * Updates camera position and rotation towards targets
   */
  public update(time: number): void {
    const lerpSpeed = 0.04;
    
    // Smoothly interpolate position
    this.camera.position.lerp(this.targetPosition, lerpSpeed);
    
    // Add subtle ambient floating motion
    if (!this.isLowPerformance) {
      const swayX = Math.sin(time * 0.5) * 0.15;
      const swayY = Math.cos(time * 0.7) * 0.1;
      const swayZ = Math.sin(time * 0.3) * 0.05;
      
      this.camera.position.x += swayX * 0.1;
      this.camera.position.y += swayY * 0.1;
      this.camera.position.z += swayZ * 0.1;
    }

    // Smoothly interpolate lookAt target
    this.currentLookAt.lerp(this.targetLookAt, lerpSpeed);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Preferences sync
   */
  public setLowPerformance(enabled: boolean): void {
    this.isLowPerformance = enabled;
  }
}
