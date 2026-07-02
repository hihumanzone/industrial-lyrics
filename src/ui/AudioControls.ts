interface AudioControlsCallbacks {
  onPlayPause: (isPlaying: boolean) => void;
  onSeek: (time: number) => void;
  onReducedMotionToggle: (enabled: boolean) => void;
}

export class AudioControls {
  private panelElement: HTMLElement;
  private btnPlayPause: HTMLButtonElement;
  private seekSlider: HTMLInputElement;
  private seekProgress: HTMLElement;
  
  // Icons
  private iconPlay: HTMLElement;
  private iconPause: HTMLElement;

  // Header displays
  private infoAudioName: HTMLElement;
  private infoLyricsName: HTMLElement;

  // Time displays
  private timeCurrent: HTMLElement;
  private timeDuration: HTMLElement;

  private isPlayingState = false;
  private duration = 0;
  private isScrubbing = false;

  private callbacks: AudioControlsCallbacks;

  constructor(callbacks: AudioControlsCallbacks) {
    this.callbacks = callbacks;

    // Cache elements
    this.panelElement = document.getElementById('controls-panel') as HTMLElement;
    this.btnPlayPause = document.getElementById('btn-play-pause') as HTMLButtonElement;
    this.seekSlider = document.getElementById('seek-slider') as HTMLInputElement;
    this.seekProgress = document.getElementById('seek-progress') as HTMLElement;

    this.iconPlay = document.getElementById('icon-play') as HTMLElement;
    this.iconPause = document.getElementById('icon-pause') as HTMLElement;

    this.infoAudioName = document.getElementById('info-audio-name') as HTMLElement;
    this.infoLyricsName = document.getElementById('info-lyrics-name') as HTMLElement;

    this.timeCurrent = document.getElementById('time-current') as HTMLElement;
    this.timeDuration = document.getElementById('time-duration') as HTMLElement;

    this.initEventListeners();
  }

  private initEventListeners(): void {
    // Play/Pause
    this.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    
    // Seek Timeline Slider
    this.seekSlider.addEventListener('mousedown', () => {
      this.isScrubbing = true;
    });

    this.seekSlider.addEventListener('touchstart', () => {
      this.isScrubbing = true;
    }, { passive: true });

    this.seekSlider.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      const targetTime = (val / 100) * this.duration;
      this.timeCurrent.textContent = this.formatTime(targetTime);
      this.seekProgress.style.width = `${val}%`;
    });

    this.seekSlider.addEventListener('change', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      const targetTime = (val / 100) * this.duration;
      this.callbacks.onSeek(targetTime);
      this.isScrubbing = false;
    });

    // Check prefers-reduced-motion media query and sync
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Triggers delayed loop to guarantee listeners ready
      setTimeout(() => {
        this.callbacks.onReducedMotionToggle(true);
      }, 100);
    }

    // Mouse proximity reveal logic for controls-panel (visible within 150px of the bottom edge)
    const handleProximity = (clientY: number) => {
      const nearBottom = (window.innerHeight - clientY) < 150;
      if (nearBottom) {
        this.panelElement.classList.add('visible');
      } else if (!this.isScrubbing) {
        this.panelElement.classList.remove('visible');
      }
    };

    window.addEventListener('mousemove', (e) => {
      handleProximity(e.clientY);
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        handleProximity(e.touches[0].clientY);
      }
    }, { passive: true });
  }

  private togglePlayPause(): void {
    this.isPlayingState = !this.isPlayingState;
    this.syncPlayStateUI();
    this.callbacks.onPlayPause(this.isPlayingState);
  }

  private syncPlayStateUI(): void {
    if (this.isPlayingState) {
      this.iconPlay.classList.add('hidden');
      this.iconPause.classList.remove('hidden');
      this.btnPlayPause.setAttribute('aria-label', 'Pause audio');
    } else {
      this.iconPlay.classList.remove('hidden');
      this.iconPause.classList.add('hidden');
      this.btnPlayPause.setAttribute('aria-label', 'Play audio');
    }
  }

  /**
   * Formats seconds into MM:SS.CC (Minutes:Seconds.Centiseconds)
   */
  public formatTime(timeInSeconds: number): string {
    if (isNaN(timeInSeconds) || timeInSeconds === Infinity) return '00:00.00';
    
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const centiseconds = Math.floor((timeInSeconds % 1) * 100);
    
    const minStr = minutes.toString().padStart(2, '0');
    const secStr = seconds.toString().padStart(2, '0');
    const centStr = centiseconds.toString().padStart(2, '0');
    
    return `${minStr}:${secStr}.${centStr}`;
  }

  /**
   * Sets the displayed metadata text in the header.
   */
  public setFileNames(audioName: string, lyricsName: string): void {
    this.infoAudioName.textContent = audioName;
    this.infoAudioName.classList.remove('empty');
    
    this.infoLyricsName.textContent = lyricsName;
    this.infoLyricsName.classList.remove('empty');
    
    this.panelElement.classList.remove('hidden');
  }

  /**
   * Updates playback time slider.
   */
  public updateTime(currentTime: number): void {
    if (this.isScrubbing) return;
    
    this.timeCurrent.textContent = this.formatTime(currentTime);
    
    if (this.duration > 0) {
      const percentage = (currentTime / this.duration) * 100;
      this.seekSlider.value = percentage.toFixed(2);
      this.seekProgress.style.width = `${percentage}%`;
    } else {
      this.seekSlider.value = '0';
      this.seekProgress.style.width = '0%';
    }
  }

  /**
   * Sets the track total duration value.
   */
  public setDuration(dur: number): void {
    this.duration = dur;
    this.timeDuration.textContent = this.formatTime(dur);
  }

  /**
   * External override to set play state programmatically (e.g. at end of track)
   */
  public setIsPlaying(playing: boolean): void {
    this.isPlayingState = playing;
    this.syncPlayStateUI();
  }
}
