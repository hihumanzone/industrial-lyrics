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
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private fps = 30;
  private exportWidth = 0;
  private exportHeight = 0;

  // Web Audio Context state
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

  constructor(options: {
    canvas: HTMLCanvasElement;
    audio: HTMLAudioElement;
    statusPanel: StatusPanel;
    getTrackName: () => string;
    onRecordingStart?: () => void;
    onRecordingEnd?: () => void;
    onResolutionLock?: (width: number, height: number) => void;
    onResolutionUnlock?: () => void;
  }) {
    this.canvas = options.canvas;
    this.audio = options.audio;
    this.statusPanel = options.statusPanel;
    this.getTrackName = options.getTrackName;
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
          <strong>CRITICAL:</strong> Keep this tab active and visible during export. Resizing the window or changing tabs will disrupt the recording.
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

  private async startRecordingFlow(): Promise<void> {
    if (this.isRecording) return;

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    try {
      this.isRecording = true;
      this.btnStart.disabled = true;
      this.muteCheckbox.disabled = true;
      this.btnFps30.disabled = true;
      this.btnFps60.disabled = true;
      this.btnResAuto.disabled = true;
      this.btnRes720p.disabled = true;
      this.btnRes1080p.disabled = true;
      this.btnCancel.textContent = 'CANCEL';
      
      this.progressText.textContent = 'PREPARING AUDIO ROUTING...';
      this.progressBar.style.width = '0%';

      // 1. Setup Audio
      this.setupAudioRouting();

      // 1.5 Lock resolution if specified
      if (this.exportWidth > 0 && this.exportHeight > 0 && this.onResolutionLock) {
        this.onResolutionLock(this.exportWidth, this.exportHeight);
      }

      // Close settings panel if open
      const settingsPanel = document.getElementById('settings-panel');
      const settingsBtn = document.getElementById('btn-settings');
      if (settingsPanel && settingsPanel.classList.contains('visible')) {
        settingsPanel.classList.remove('visible');
        if (settingsBtn) settingsBtn.classList.remove('panel-active');
      }

      // 2. Prepare streams
      const videoStream = this.canvas.captureStream(this.fps);
      const audioStream = this.audioDestNode!.stream;

      const combinedStream = new MediaStream();
      videoStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
      audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

      // 3. Supported MIME formats check
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

      // 4. Disable regular UI controls
      if (this.onRecordingStart) this.onRecordingStart();
      this.disableExternalControls(true);

      // Mute audio playback if muteCheckbox is checked
      if (this.muteCheckbox.checked) {
        this.audioSourceNode?.disconnect(this.audioCtx!.destination);
      }

      // 5. Seek to beginning and wait for it
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

      // 6. Setup MediaRecorder
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
        this.saveRecording(selectedMimeType);
        this.resetUIAfterRecording();
      };

      // 7. Fire recording
      this.mediaRecorder.start(1000);
      
      this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
      this.audio.addEventListener('ended', this.handleAudioEnded);

      this.progressText.textContent = 'RECORDING: 0%';
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
    this.progressText.textContent = `RECORDING: ${percentage.toFixed(0)}% (${this.formatProgressTime(current)} / ${this.formatProgressTime(duration)})`;
    
    if (current >= duration) {
      this.stopRecording();
    }
  };

  private handleAudioEnded = (): void => {
    this.stopRecording();
  };

  private stopRecording(): void {
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

  private cancelOrCloseFlow(): void {
    if (this.isRecording) {
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

  private saveRecording(mimeType: string): void {
    if (this.recordedChunks.length === 0) {
      this.statusPanel.showMessage('No video segments captured.', 'error');
      return;
    }

    try {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      let extension = 'webm';
      if (mimeType.includes('mp4')) {
        extension = 'mp4';
      }

      const trackName = this.getTrackName().replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${trackName || 'lyrics-video'}_export.${extension}`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 5000);

      this.statusPanel.showMessage('Video export completed successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      this.statusPanel.showMessage(`Failed to save recording: ${err.message}`, 'error');
    }
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
