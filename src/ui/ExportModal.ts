import { StatusPanel } from './StatusPanel';

export class ExportModal {
  private modalElement!: HTMLElement;
  private btnStart!: HTMLButtonElement;
  private btnCancel!: HTMLButtonElement;
  private btnFps30!: HTMLButtonElement;
  private btnFps60!: HTMLButtonElement;
  private btnResAuto!: HTMLButtonElement;
  private btnRes720p!: HTMLButtonElement;
  private btnRes1080p!: HTMLButtonElement;
  private progressBar!: HTMLElement;
  private progressText!: HTMLElement;
  private muteCheckbox!: HTMLInputElement;

  private canvas: HTMLCanvasElement;
  private audio: HTMLAudioElement;
  private statusPanel: StatusPanel;

  // Recording state
  private isRecording = false;
  private fps = 30;
  private exportWidth = 0;
  private exportHeight = 0;

  // Legacy MediaRecorder state (fallback)
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  // Web Audio Context state (shared between both export paths)
  private audioCtx: AudioContext | null = null;
  private audioSourceNode: MediaElementAudioSourceNode | null = null;
  private audioDestNode: MediaStreamAudioDestinationNode | null = null;

  // Cache elements to disable during export
  private playPauseBtn: HTMLButtonElement | null = null;
  private seekSlider: HTMLInputElement | null = null;
  private settingsBtn: HTMLButtonElement | null = null;

  private onRecordingStart?: () => void;
  private onRecordingEnd?: () => void;
  private onResolutionLock?: (width: number, height: number) => void;
  private onResolutionUnlock?: () => void;
  private getTrackName: () => string;

  // New callbacks for offline rendering
  private renderFrameAtTime: (time: number) => void;
  private stopRenderLoop: () => void;
  private resumeRenderLoop: () => void;
  private getAudioFile: () => File | null;

  constructor(options: {
    canvas: HTMLCanvasElement;
    audio: HTMLAudioElement;
    statusPanel: StatusPanel;
    getTrackName: () => string;
    renderFrameAtTime: (time: number) => void;
    stopRenderLoop: () => void;
    resumeRenderLoop: () => void;
    getAudioFile: () => File | null;
    onRecordingStart?: () => void;
    onRecordingEnd?: () => void;
    onResolutionLock?: (width: number, height: number) => void;
    onResolutionUnlock?: () => void;
  }) {
    this.canvas = options.canvas;
    this.audio = options.audio;
    this.statusPanel = options.statusPanel;
    this.getTrackName = options.getTrackName;
    this.renderFrameAtTime = options.renderFrameAtTime;
    this.stopRenderLoop = options.stopRenderLoop;
    this.resumeRenderLoop = options.resumeRenderLoop;
    this.getAudioFile = options.getAudioFile;
    this.onRecordingStart = options.onRecordingStart;
    this.onRecordingEnd = options.onRecordingEnd;
    this.onResolutionLock = options.onResolutionLock;
    this.onResolutionUnlock = options.onResolutionUnlock;

    // Cache normal controls
    this.playPauseBtn = document.getElementById('btn-play-pause') as HTMLButtonElement;
    this.seekSlider = document.getElementById('seek-slider') as HTMLInputElement;
    this.settingsBtn = document.getElementById('btn-settings') as HTMLButtonElement;

    this.createModalDOM();
    this.cacheElements();
    this.initEventListeners();
  }

  private createModalDOM(): void {
    if (document.getElementById('export-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'export-modal';
    modal.className = 'export-modal';
    modal.innerHTML = `
      <div class="export-modal-content">
        <h3>EXPORT LYRICS VIDEO</h3>
        <p class="export-description">
          Render the synchronized 3D lyrics scene along with the loaded audio directly to a video file.
        </p>
        
        <div class="export-settings">
          <div class="settings-group">
            <span class="settings-label">VIDEO QUALITY (FRAME RATE)</span>
            <div class="export-fps-options">
              <button id="btn-export-fps-30" class="btn btn-fps active">30 FPS</button>
              <button id="btn-export-fps-60" class="btn btn-fps">60 FPS</button>
            </div>
          </div>

          <div class="settings-group">
            <span class="settings-label">OUTPUT RESOLUTION</span>
            <div class="export-res-options">
              <button id="btn-export-res-auto" class="btn btn-res active" data-width="0" data-height="0">AUTO (WINDOW)</button>
              <button id="btn-export-res-720p" class="btn btn-res" data-width="1280" data-height="720">720P (HD)</button>
              <button id="btn-export-res-1080p" class="btn btn-res" data-width="1920" data-height="1080">1080P (FHD)</button>
            </div>
          </div>
          
          <div class="settings-group">
            <label class="export-checkbox-container">
              <input type="checkbox" id="chk-export-mute" checked>
              Mute playback sound during export
            </label>
          </div>
          
          <div class="settings-group">
            <span class="settings-label">RECORDING STATUS</span>
            <div class="export-status-box">
              <span id="export-progress-text">READY</span>
              <div class="progress-bar-container">
                <div id="export-progress-bar" class="progress-bar"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="export-warning">
          <strong>NOTE:</strong> Export renders frames offline — your screen may appear frozen during rendering. The final file will play back perfectly at the selected FPS.
        </div>

        <div class="export-actions">
          <button id="btn-start-export" class="btn btn-primary">START EXPORT</button>
          <button id="btn-cancel-export" class="btn btn-secondary">CLOSE</button>
        </div>
      </div>
    `;

    const appWrapper = document.getElementById('app');
    if (appWrapper) {
      appWrapper.appendChild(modal);
    } else {
      document.body.appendChild(modal);
    }
  }

  private cacheElements(): void {
    this.modalElement = document.getElementById('export-modal') as HTMLElement;
    this.btnStart = document.getElementById('btn-start-export') as HTMLButtonElement;
    this.btnCancel = document.getElementById('btn-cancel-export') as HTMLButtonElement;
    this.btnFps30 = document.getElementById('btn-export-fps-30') as HTMLButtonElement;
    this.btnFps60 = document.getElementById('btn-export-fps-60') as HTMLButtonElement;
    this.btnResAuto = document.getElementById('btn-export-res-auto') as HTMLButtonElement;
    this.btnRes720p = document.getElementById('btn-export-res-720p') as HTMLButtonElement;
    this.btnRes1080p = document.getElementById('btn-export-res-1080p') as HTMLButtonElement;
    this.progressBar = document.getElementById('export-progress-bar') as HTMLElement;
    this.progressText = document.getElementById('export-progress-text') as HTMLElement;
    this.muteCheckbox = document.getElementById('chk-export-mute') as HTMLInputElement;
  }

  private initEventListeners(): void {
    this.btnFps30.addEventListener('click', () => this.setFps(30));
    this.btnFps60.addEventListener('click', () => this.setFps(60));

    this.btnResAuto.addEventListener('click', () => this.setResolution(0, 0));
    this.btnRes720p.addEventListener('click', () => this.setResolution(1280, 720));
    this.btnRes1080p.addEventListener('click', () => this.setResolution(1920, 1080));

    this.btnStart.addEventListener('click', () => this.startRecordingFlow());
    this.btnCancel.addEventListener('click', () => this.cancelOrCloseFlow());
  }

  private setFps(fps: number): void {
    if (this.isRecording) return;
    this.fps = fps;
    if (fps === 30) {
      this.btnFps30.classList.add('active');
      this.btnFps60.classList.remove('active');
    } else {
      this.btnFps60.classList.add('active');
      this.btnFps30.classList.remove('active');
    }
  }

  private setResolution(width: number, height: number): void {
    if (this.isRecording) return;
    this.exportWidth = width;
    this.exportHeight = height;

    this.btnResAuto.classList.remove('active');
    this.btnRes720p.classList.remove('active');
    this.btnRes1080p.classList.remove('active');

    if (width === 0) {
      this.btnResAuto.classList.add('active');
    } else if (width === 1280) {
      this.btnRes720p.classList.add('active');
    } else if (width === 1920) {
      this.btnRes1080p.classList.add('active');
    }
  }

  // ─── Check if WebCodecs (and thus Mediabunny's CanvasSource) is available ───
  private supportsWebCodecs(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
  }

  // ─── Main entry point: pick the best export pipeline ───
  private async startRecordingFlow(): Promise<void> {
    if (this.isRecording) return;

    if (this.supportsWebCodecs()) {
      await this.startOfflineExport();
    } else {
      await this.startLegacyRecording();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIMARY PATH: Offline frame-by-frame rendering via Mediabunny + WebCodecs
  // ═══════════════════════════════════════════════════════════════════════════

  private async startOfflineExport(): Promise<void> {
    try {
      this.lockUI();
      this.progressText.textContent = 'PREPARING EXPORT...';
      this.progressBar.style.width = '0%';

      // Close settings panel if open
      this.closeSettingsPanel();

      // Lock resolution if specified
      if (this.exportWidth > 0 && this.exportHeight > 0 && this.onResolutionLock) {
        this.onResolutionLock(this.exportWidth, this.exportHeight);
      }

      // Disable regular UI controls
      if (this.onRecordingStart) this.onRecordingStart();
      this.disableExternalControls(true);

      // Pause live audio playback
      this.audio.pause();

      // 1. Decode audio into AudioBuffer
      this.progressText.textContent = 'DECODING AUDIO...';
      await this.yieldToUI();

      const audioFile = this.getAudioFile();
      if (!audioFile) {
        throw new Error('No audio file available for export.');
      }

      const arrayBuffer = await audioFile.arrayBuffer();
      const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      await tempCtx.close();

      if (!this.isRecording) return; // Cancelled during decode

      // 2. Compute frame metrics
      const duration = audioBuffer.duration;
      const totalFrames = Math.ceil(duration * this.fps);
      const frameDuration = 1 / this.fps;

      // 3. Import Mediabunny (tree-shaken dynamic import)
      this.progressText.textContent = 'INITIALIZING ENCODER...';
      await this.yieldToUI();

      const {
        Output,
        Mp4OutputFormat,
        BufferTarget,
        CanvasSource,
        AudioBufferSource,
        QUALITY_HIGH,
        canEncodeVideo,
        canEncodeAudio,
      } = await import('mediabunny');

      // 4. Pick the best available video codec for MP4
      const videoCodecCandidates = ['avc', 'hevc', 'vp9'] as const;
      let videoCodec: 'avc' | 'hevc' | 'vp9' | null = null;
      for (const candidate of videoCodecCandidates) {
        if (await canEncodeVideo(candidate)) {
          videoCodec = candidate;
          break;
        }
      }
      if (!videoCodec) {
        throw new Error('No supported video encoder found. Try Chrome or Edge.');
      }

      // 5. Pick the best available audio codec for MP4
      const audioCodecCandidates = ['aac', 'opus'] as const;
      let audioCodec: 'aac' | 'opus' | null = null;
      for (const candidate of audioCodecCandidates) {
        if (await canEncodeAudio(candidate)) {
          audioCodec = candidate;
          break;
        }
      }
      if (!audioCodec) {
        throw new Error('No supported audio encoder found. Try Chrome or Edge.');
      }

      // 6. Create Mediabunny Output
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new BufferTarget(),
      });

      const videoSource = new CanvasSource(this.canvas, {
        codec: videoCodec,
        bitrate: QUALITY_HIGH,
        keyFrameInterval: 2,
      });
      output.addVideoTrack(videoSource, {
        frameRate: this.fps,
      });

      const audioSource = new AudioBufferSource({
        codec: audioCodec,
        bitrate: 128_000,
      });
      output.addAudioTrack(audioSource);

      await output.start();

      if (!this.isRecording) {
        await output.finalize();
        return;
      }

      // 7. Stop the live render loop — we own the canvas now
      this.stopRenderLoop();

      // 8. Render all video frames offline
      this.progressText.textContent = `RENDERING: 0% (0/${totalFrames} frames)`;
      await this.yieldToUI();

      for (let i = 0; i < totalFrames; i++) {
        if (!this.isRecording) break; // Cancellation

        const time = i * frameDuration;
        this.renderFrameAtTime(time);

        // Add the rendered frame to the video source
        const keyFrame = (i % (this.fps * 2) === 0); // Key frame every ~2 seconds
        await videoSource.add(time, frameDuration, { keyFrame });

        // Update progress every 10 frames to avoid UI thrashing
        if (i % 10 === 0 || i === totalFrames - 1) {
          const pct = ((i + 1) / totalFrames * 100);
          this.progressBar.style.width = `${pct.toFixed(1)}%`;
          this.progressText.textContent = `RENDERING: ${pct.toFixed(0)}% (${i + 1}/${totalFrames} frames)`;
          await this.yieldToUI();
        }
      }

      if (!this.isRecording) {
        // Cancelled during rendering
        this.resumeRenderLoop();
        await output.finalize();
        this.resetUIAfterRecording();
        return;
      }

      // 9. Encode audio
      this.progressText.textContent = 'ENCODING AUDIO...';
      this.progressBar.style.width = '95%';
      await this.yieldToUI();

      await audioSource.add(audioBuffer);

      // 10. Finalize
      this.progressText.textContent = 'FINALIZING MP4...';
      this.progressBar.style.width = '98%';
      await this.yieldToUI();

      await output.finalize();

      // 11. Download
      const { buffer } = output.target as InstanceType<typeof BufferTarget>;
      if (!buffer) {
        throw new Error('Export produced no output data.');
      }
      const blob = new Blob([buffer], { type: 'video/mp4' });
      this.downloadBlob(blob, 'mp4');

      // 12. Resume live rendering
      this.resumeRenderLoop();
      this.statusPanel.showMessage('Video export completed successfully!', 'success');
      this.resetUIAfterRecording();

    } catch (err: any) {
      console.error('Offline export failed:', err);
      this.resumeRenderLoop();

      if (this.isRecording) {
        this.statusPanel.showMessage(`Export failed: ${err.message}`, 'error');
      }
      this.resetUIAfterRecording();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FALLBACK PATH: Real-time MediaRecorder (for Firefox/Safari)
  // ═══════════════════════════════════════════════════════════════════════════

  private async startLegacyRecording(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    try {
      this.lockUI();
      this.progressText.textContent = 'PREPARING AUDIO ROUTING...';
      this.progressBar.style.width = '0%';

      // Setup Audio
      this.setupAudioRouting();

      // Lock resolution if specified
      if (this.exportWidth > 0 && this.exportHeight > 0 && this.onResolutionLock) {
        this.onResolutionLock(this.exportWidth, this.exportHeight);
      }

      // Close settings panel if open
      this.closeSettingsPanel();

      // Prepare streams
      const videoStream = this.canvas.captureStream(this.fps);
      const audioStream = this.audioDestNode!.stream;

      const combinedStream = new MediaStream();
      videoStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
      audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

      // Supported MIME formats check
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error('No supported video recording formats found in this browser.');
      }

      // Disable regular UI controls
      if (this.onRecordingStart) this.onRecordingStart();
      this.disableExternalControls(true);

      // Mute audio playback if muteCheckbox is checked
      if (this.muteCheckbox.checked) {
        this.audioSourceNode?.disconnect(this.audioCtx!.destination);
      }

      // Seek to beginning and wait for it
      this.audio.pause();
      this.audio.currentTime = 0;

      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          this.audio.removeEventListener('seeked', onSeeked);
          resolve();
        };
        this.audio.addEventListener('seeked', onSeeked);
        setTimeout(resolve, 250);
      });

      // Setup MediaRecorder
      this.recordedChunks = [];
      const options = {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 5000000,
        audioBitsPerSecond: 128000
      };

      this.mediaRecorder = new MediaRecorder(combinedStream, options);
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveLegacyRecording(selectedMimeType);
        this.resetUIAfterRecording();
      };

      // Fire recording
      this.mediaRecorder.start(1000);
      
      this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
      this.audio.addEventListener('ended', this.handleAudioEnded);

      this.progressText.textContent = 'RECORDING (LIVE): 0%';
      await this.audio.play();

    } catch (err: any) {
      console.error(err);
      this.statusPanel.showMessage(`Failed to start video export: ${err.message}`, 'error');
      this.resetUIAfterRecording();
    }
  }

  private setupAudioRouting(): void {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioSourceNode = this.audioCtx.createMediaElementSource(this.audio);
      this.audioDestNode = this.audioCtx.createMediaStreamDestination();
      
      this.audioSourceNode.connect(this.audioDestNode);
      this.audioSourceNode.connect(this.audioCtx.destination);
    }
  }

  private handleTimeUpdate = (): void => {
    const current = this.audio.currentTime;
    const duration = this.audio.duration || 1;
    const percentage = Math.min(100, (current / duration) * 100);
    this.progressBar.style.width = `${percentage.toFixed(1)}%`;
    this.progressText.textContent = `RECORDING (LIVE): ${percentage.toFixed(0)}% (${this.formatProgressTime(current)} / ${this.formatProgressTime(duration)})`;
    
    if (current >= duration) {
      this.stopLegacyRecording();
    }
  };

  private handleAudioEnded = (): void => {
    this.stopLegacyRecording();
  };

  private stopLegacyRecording(): void {
    if (!this.isRecording) return;
    
    this.audio.removeEventListener('timeupdate', this.handleTimeUpdate);
    this.audio.removeEventListener('ended', this.handleAudioEnded);
    
    this.audio.pause();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.progressText.textContent = 'PROCESSING VIDEO FILE...';
      this.mediaRecorder.stop();
    } else {
      this.resetUIAfterRecording();
    }
  }

  // ─── Shared utilities ───

  private cancelOrCloseFlow(): void {
    if (this.isRecording) {
      // Signal cancellation — the offline loop checks this.isRecording each iteration
      this.isRecording = false;

      // Legacy path: also clean up MediaRecorder
      this.audio.removeEventListener('timeupdate', this.handleTimeUpdate);
      this.audio.removeEventListener('ended', this.handleAudioEnded);
      this.audio.pause();
      
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.stop();
      }
      
      this.statusPanel.showMessage('Export cancelled.', 'info');
      this.resetUIAfterRecording();
    } else {
      this.hide();
    }
  }

  private saveLegacyRecording(mimeType: string): void {
    if (this.recordedChunks.length === 0) {
      this.statusPanel.showMessage('No video segments captured.', 'error');
      return;
    }

    try {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      let extension = 'webm';
      if (mimeType.includes('mp4')) {
        extension = 'mp4';
      }
      this.downloadBlob(blob, extension);
      this.statusPanel.showMessage('Video export completed successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      this.statusPanel.showMessage(`Failed to save recording: ${err.message}`, 'error');
    }
  }

  private downloadBlob(blob: Blob, extension: string): void {
    const url = URL.createObjectURL(blob);
    const trackName = this.getTrackName().replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${trackName || 'lyrics-video'}_export.${extension}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);
  }

  private lockUI(): void {
    this.isRecording = true;
    this.btnStart.disabled = true;
    this.muteCheckbox.disabled = true;
    this.btnFps30.disabled = true;
    this.btnFps60.disabled = true;
    this.btnResAuto.disabled = true;
    this.btnRes720p.disabled = true;
    this.btnRes1080p.disabled = true;
    this.btnCancel.textContent = 'CANCEL';
  }

  private resetUIAfterRecording(): void {
    this.isRecording = false;
    this.btnStart.disabled = false;
    this.muteCheckbox.disabled = false;
    this.btnFps30.disabled = false;
    this.btnFps60.disabled = false;
    this.btnResAuto.disabled = false;
    this.btnRes720p.disabled = false;
    this.btnRes1080p.disabled = false;
    this.btnCancel.textContent = 'CLOSE';
    this.progressText.textContent = 'READY';
    this.progressBar.style.width = '0%';

    // Restore resolution
    if (this.onResolutionUnlock) {
      this.onResolutionUnlock();
    }

    // Reconnect speaker playback
    if (this.audioCtx && this.audioSourceNode) {
      try {
        this.audioSourceNode.connect(this.audioCtx.destination);
      } catch {
        // Safe catch
      }
    }

    this.disableExternalControls(false);
    if (this.onRecordingEnd) this.onRecordingEnd();
  }

  private disableExternalControls(disable: boolean): void {
    if (this.playPauseBtn) this.playPauseBtn.disabled = disable;
    if (this.seekSlider) this.seekSlider.disabled = disable;
    if (this.settingsBtn) this.settingsBtn.disabled = disable;
    
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.style.pointerEvents = disable ? 'none' : 'auto';
    }
  }

  private closeSettingsPanel(): void {
    const settingsPanel = document.getElementById('settings-panel');
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsPanel && settingsPanel.classList.contains('visible')) {
      settingsPanel.classList.remove('visible');
      if (settingsBtn) settingsBtn.classList.remove('panel-active');
    }
  }

  /** Yield to the browser event loop so the UI (progress bar, text) can repaint. */
  private yieldToUI(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  private formatProgressTime(seconds: number): string {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  public isExporting(): boolean {
    return this.isRecording;
  }

  public show(): void {
    this.modalElement.classList.add('visible');
  }

  public hide(): void {
    this.modalElement.classList.remove('visible');
  }
}
