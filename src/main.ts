import './styles.css';
import { parseLRC } from './lib/lrc';
import { AudioManager } from './lib/file';
import { StatusPanel } from './ui/StatusPanel';
import { FileDropZone } from './ui/FileDropZone';
import { AudioControls } from './ui/AudioControls';
import { SettingsPanel } from './ui/SettingsPanel';
import { LyricsMachine } from './scene/LyricsMachine';
import { ExportModal } from './ui/ExportModal';

class App {
  private audio: HTMLAudioElement;
  private audioManager: AudioManager;
  
  // UI & Scene Managers
  private statusPanel: StatusPanel;
  private dropZone: FileDropZone;
  private controls: AudioControls;
  private sceneMachine!: LyricsMachine;
  private exportModal!: ExportModal;

  // State
  private currentAudioFile: File | null = null;
  private currentLyricsName: string = 'None';
  private hasWebGL = true;

  constructor() {
    // 1. Initialize audio element
    this.audio = new Audio();
    this.audioManager = new AudioManager();
    
    // 2. Initialize UI modules
    this.statusPanel = new StatusPanel();
    new SettingsPanel();
    
    // 3. Check WebGL support before creating scene
    this.checkWebGLSupport();

    // 4. Initialize Three.js scene (if WebGL available)
    if (this.hasWebGL) {
      try {
        this.sceneMachine = new LyricsMachine('webgl-canvas', this.audio);
      } catch (err) {
        console.error('Three.js initialization failed:', err);
        this.hasWebGL = false;
      }
    }

    // 5. Initialize HUD controls and Dropzone callbacks
    this.controls = new AudioControls({
      onPlayPause: (play) => this.handlePlayPause(play),
      onSeek: (time) => this.handleSeek(time),
      onReducedMotionToggle: (enabled) => this.handleReducedMotionToggle(enabled)
    });

    this.dropZone = new FileDropZone({
      onAudioLoaded: (file) => this.handleAudioFile(file),
      onLyricsLoaded: (name, text) => this.handleLyricsFile(name, text)
    }, this.statusPanel);

    // 6. Connect Audio player events
    this.initAudioEventListeners();

    // 7. Initialize export modal
    this.initExportModal();

    // 8. Force 2D fallback mode if WebGL is unavailable
    if (!this.hasWebGL) {
      this.statusPanel.showMessage('WebGL is unavailable. Falling back to 2D viewer.', 'error', 6000);
      this.handleFallbackViewToggle(true);
    }
  }

  private checkWebGLSupport(): void {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      this.hasWebGL = !!gl;
    } catch {
      this.hasWebGL = false;
    }
  }

  private initAudioEventListeners(): void {
    // Playback ticks
    this.audio.addEventListener('timeupdate', () => {
      const time = this.audio.currentTime;
      this.controls.updateTime(time);
      if (this.hasWebGL && this.sceneMachine) {
        this.sceneMachine.updateTime(time);
      }
    });

    // Duration load
    this.audio.addEventListener('durationchange', () => {
      this.controls.setDuration(this.audio.duration);
    });
    this.audio.addEventListener('loadedmetadata', () => {
      this.controls.setDuration(this.audio.duration);
    });

    // Handle track completion
    this.audio.addEventListener('ended', () => {
      if (this.exportModal && this.exportModal.isExporting()) {
        return;
      }
      this.audio.currentTime = 0;
      this.controls.setIsPlaying(false);
      this.controls.updateTime(0);
      if (this.hasWebGL && this.sceneMachine) {
        this.sceneMachine.seek(0);
      }
    });

    // Error handling for bad audio codecs
    this.audio.addEventListener('error', () => {
      this.statusPanel.showMessage('Error loading audio track. File format may be unsupported.', 'error');
      this.controls.setIsPlaying(false);
    });
  }

  private handleAudioFile(file: File): void {
    this.currentAudioFile = file;
    
    // Stop playback if playing
    this.audio.pause();
    this.controls.setIsPlaying(false);

    // Create and load Object URL
    const url = this.audioManager.createAudioUrl(file);
    this.audio.src = url;
    this.audio.load();

    // Update displays
    this.syncHUDHeader();
  }

  private handleLyricsFile(name: string, text: string): void {
    this.currentLyricsName = name;

    try {
      const parsed = parseLRC(text);
      
      if (parsed.lines.length === 0) {
        this.statusPanel.showMessage('Loaded LRC contains no valid timed lyric lines.', 'error');
        return;
      }

      // Sync with 3D scene
      if (this.hasWebGL && this.sceneMachine) {
        this.sceneMachine.setLyrics(parsed);
      }

      // Print song info from metadata
      if (parsed.metadata.title || parsed.metadata.artist) {
        const title = parsed.metadata.title || 'Unknown Title';
        const artist = parsed.metadata.artist || 'Unknown Artist';
        this.statusPanel.showMessage(`Metadata: "${title}" by ${artist}`, 'success');
      }

      this.syncHUDHeader();

    } catch (err) {
      console.error(err);
      this.statusPanel.showMessage('Failed to parse lyrics. Invalid LRC structure.', 'error');
    }
  }

  private syncHUDHeader(): void {
    const audioName = this.currentAudioFile ? this.currentAudioFile.name : 'None Loaded';
    this.controls.setFileNames(audioName, this.currentLyricsName);

    // Hide dropzone if both are loaded
    if (this.currentAudioFile && this.currentLyricsName !== 'None') {
      this.dropZone.hide();
    }
  }

  // Audio Control Bridges
  private handlePlayPause(isPlaying: boolean): void {
    if (!this.audio.src) {
      this.statusPanel.showMessage('No audio loaded. Drag files here first!', 'error');
      this.controls.setIsPlaying(false);
      return;
    }

    if (isPlaying) {
      this.audio.play().catch((err) => {
        console.error('Audio play failed:', err);
        this.controls.setIsPlaying(false);
        this.statusPanel.showMessage('Playback failed. Interact with document first.', 'error');
      });
    } else {
      this.audio.pause();
    }
  }

  private handleSeek(time: number): void {
    if (!this.audio.src) return;
    this.audio.currentTime = time;
    
    // Force instant update to sync panels immediately on scrub
    if (this.hasWebGL && this.sceneMachine) {
      this.sceneMachine.seek(time);
    }
  }

  // Visual Preference Bridges
  private handleReducedMotionToggle(enabled: boolean): void {
    if (this.hasWebGL && this.sceneMachine) {
      this.sceneMachine.setReducedMotion(enabled);
    }
  }

  private handleFallbackViewToggle(enabled: boolean): void {
    if (this.hasWebGL && this.sceneMachine) {
      this.sceneMachine.setFallbackView(enabled);
    }
    const overlay = document.getElementById('fallback-lyrics-overlay');
    if (overlay) {
      if (enabled) overlay.classList.remove('hidden');
      else overlay.classList.add('hidden');
    }
  }

  private initExportModal(): void {
    const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
    this.exportModal = new ExportModal({
      canvas,
      audio: this.audio,
      statusPanel: this.statusPanel,
      getTrackName: () => {
        return this.currentAudioFile ? this.currentAudioFile.name.replace(/\.[^/.]+$/, "") : "lyrics-video";
      },
      renderFrameAtTime: (time: number) => {
        if (this.hasWebGL && this.sceneMachine) {
          this.sceneMachine.renderAtTime(time);
        }
      },
      stopRenderLoop: () => {
        if (this.hasWebGL && this.sceneMachine) {
          this.sceneMachine.stopLoop();
        }
      },
      resumeRenderLoop: () => {
        if (this.hasWebGL && this.sceneMachine) {
          this.sceneMachine.resumeLoop();
        }
      },
      getAudioFile: () => {
        return this.currentAudioFile;
      },
      onResolutionLock: (width, height) => {
        if (this.hasWebGL && this.sceneMachine) {
          this.sceneMachine.lockResolution(width, height);
        }
      },
      onResolutionUnlock: () => {
        if (this.hasWebGL && this.sceneMachine) {
          this.sceneMachine.unlockResolution();
        }
      }
    });

    const btnExport = document.getElementById('btn-export-trigger');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        if (!this.audio.src) {
          this.statusPanel.showMessage('No audio loaded. Drag files here first!', 'error');
          return;
        }
        this.exportModal.show();
      });
    }
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
