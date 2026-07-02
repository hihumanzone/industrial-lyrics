import { isAudioFile, isLrcFile, readTextFile } from '../lib/file';
import { StatusPanel } from './StatusPanel';

interface FileDropZoneCallbacks {
  onAudioLoaded: (file: File) => void;
  onLyricsLoaded: (filename: string, text: string) => void;
}

export class FileDropZone {
  private dropZoneElement: HTMLElement;
  private inputAudio: HTMLInputElement;
  private inputLyrics: HTMLInputElement;
  private statusPanel: StatusPanel;
  private callbacks: FileDropZoneCallbacks;

  constructor(callbacks: FileDropZoneCallbacks, statusPanel: StatusPanel) {
    this.callbacks = callbacks;
    this.statusPanel = statusPanel;

    this.dropZoneElement = document.getElementById('drop-zone') as HTMLElement;
    this.inputAudio = document.getElementById('input-audio') as HTMLInputElement;
    this.inputLyrics = document.getElementById('input-lyrics') as HTMLInputElement;

    this.initEventListeners();
  }

  private initEventListeners(): void {
    // Prevent default drag behaviors
    const preventDefaults = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.dropZoneElement.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Add/remove dragover highlighting
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZoneElement.addEventListener(eventName, () => {
        this.dropZoneElement.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZoneElement.addEventListener(eventName, () => {
        this.dropZoneElement.classList.remove('dragover');
      }, false);
    });

    // Handle dropped files
    this.dropZoneElement.addEventListener('drop', (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (dt && dt.files) {
        this.handleFiles(dt.files);
      }
    });

    // Handle file input changes
    this.inputAudio.addEventListener('change', () => {
      if (this.inputAudio.files && this.inputAudio.files.length > 0) {
        this.handleFiles(this.inputAudio.files);
      }
    });

    this.inputLyrics.addEventListener('change', () => {
      if (this.inputLyrics.files && this.inputLyrics.files.length > 0) {
        this.handleFiles(this.inputLyrics.files);
      }
    });
  }

  /**
   * Processes the files selected or dropped by the user.
   */
  private handleFiles(files: FileList): void {
    let audioFile: File | null = null;
    let lrcFile: File | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (isAudioFile(file)) {
        audioFile = file;
      } else if (isLrcFile(file)) {
        lrcFile = file;
      }
    }

    if (audioFile) {
      this.statusPanel.showMessage(`Audio file loaded: ${audioFile.name}`, 'success');
      this.callbacks.onAudioLoaded(audioFile);
    }

    if (lrcFile) {
      readTextFile(lrcFile)
        .then((text) => {
          this.statusPanel.showMessage(`Lyrics file loaded: ${lrcFile!.name}`, 'success');
          this.callbacks.onLyricsLoaded(lrcFile!.name, text);
        })
        .catch((err) => {
          const errMsg = err instanceof Error ? err.message : 'Error reading file';
          this.statusPanel.showMessage(`Lyrics load error: ${errMsg}`, 'error');
        });
    }

    if (!audioFile && !lrcFile && files.length > 0) {
      this.statusPanel.showMessage('Unsupported file type. Load audio tracks or .lrc lyrics.', 'error');
    }
  }

  /**
   * Hides the central drop zone.
   */
  public hide(): void {
    this.dropZoneElement.classList.add('hidden');
  }

  /**
   * Shows the central drop zone.
   */
  public show(): void {
    this.dropZoneElement.classList.remove('hidden');
  }
}
