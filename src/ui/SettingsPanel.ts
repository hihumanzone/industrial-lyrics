import { BgImageStorage } from '../lib/file';


export class SettingsPanel {
  private btnSettings: HTMLButtonElement;
  private panelElement: HTMLElement;
  private btnCloseSettings: HTMLButtonElement;
  private inputBgImage: HTMLInputElement;
  private btnClearBg: HTMLButtonElement;
  private sliderDarkness: HTMLInputElement;
  private sliderBlur: HTMLInputElement;
  private labelDarknessValue: HTMLElement;
  private labelBlurValue: HTMLElement;
  private bgImageElement: HTMLElement;

  private storage: BgImageStorage;
  private currentBgUrl: string | null = null;

  constructor() {
    this.btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
    this.panelElement = document.getElementById('settings-panel') as HTMLElement;
    this.btnCloseSettings = document.getElementById('btn-close-settings') as HTMLButtonElement;
    this.inputBgImage = document.getElementById('input-bg-image') as HTMLInputElement;
    this.btnClearBg = document.getElementById('btn-clear-bg') as HTMLButtonElement;
    this.sliderDarkness = document.getElementById('slider-bg-darkness') as HTMLInputElement;
    this.sliderBlur = document.getElementById('slider-bg-blur') as HTMLInputElement;
    this.labelDarknessValue = document.getElementById('label-bg-darkness-value') as HTMLElement;
    this.labelBlurValue = document.getElementById('label-bg-blur-value') as HTMLElement;
    this.bgImageElement = document.getElementById('lyrics-bg-image') as HTMLElement;

    this.storage = new BgImageStorage();

    this.initEventListeners();
    this.loadSettings();
    this.loadPersistedImage();
  }

  private initEventListeners(): void {
    // Toggle settings panel visibility
    this.btnSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = this.panelElement.classList.toggle('visible');
      if (isVisible) {
        this.btnSettings.classList.add('panel-active');
      } else {
        this.btnSettings.classList.remove('panel-active');
      }
    });

    this.btnCloseSettings.addEventListener('click', () => {
      this.panelElement.classList.remove('visible');
      this.btnSettings.classList.remove('panel-active');
    });

    // Close panel when clicking outside of it
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (
        this.panelElement.classList.contains('visible') &&
        !this.panelElement.contains(target) &&
        target !== this.btnSettings &&
        !this.btnSettings.contains(target)
      ) {
        this.panelElement.classList.remove('visible');
        this.btnSettings.classList.remove('panel-active');
      }
    });

    // Prevent closing when clicking inside the panel
    this.panelElement.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Clipboard paste event listener
    document.addEventListener('paste', async (e) => {
      // Only handle paste if the settings panel is visible (active configuration mode)
      if (!this.panelElement.classList.contains('visible')) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            this.setBackgroundImage(file);
            try {
              await this.storage.saveImage(file);
              this.dispatchBgUpdate(file);
            } catch (err) {
              console.error('Failed to persist pasted background image:', err);
            }
          }
          break; // Stop after finding the first image
        }
      }
    });

    // File input handler for image upload
    this.inputBgImage.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          this.setBackgroundImage(file);
          try {
            await this.storage.saveImage(file);
            this.dispatchBgUpdate(file);
          } catch (err) {
            console.error('Failed to persist background image:', err);
          }
        }
      }
    });

    // Remove background image handler
    this.btnClearBg.addEventListener('click', async () => {
      if (this.currentBgUrl) {
        URL.revokeObjectURL(this.currentBgUrl);
        this.currentBgUrl = null;
      }
      this.bgImageElement.style.backgroundImage = '';
      this.bgImageElement.classList.remove('has-image');
      this.btnClearBg.classList.add('hidden');
      this.inputBgImage.value = ''; // Clear file input
      try {
        await this.storage.clearImage();
        this.dispatchBgUpdate(null);
      } catch (err) {
        console.error('Failed to clear persisted background image:', err);
      }
    });

    // Slider inputs for real-time visual adjustment
    this.sliderDarkness.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      this.labelDarknessValue.textContent = `${val}%`;
      // darkness % maps to (1 - val/100) brightness
      this.bgImageElement.style.setProperty('--bg-brightness', (1 - val / 100).toFixed(2));
      localStorage.setItem('lyrics-bg-darkness', val.toString());
    });

    this.sliderDarkness.addEventListener('change', async () => {
      const file = await this.storage.loadImage();
      this.dispatchBgUpdate(file);
    });

    this.sliderBlur.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      this.labelBlurValue.textContent = `${val}px`;
      this.bgImageElement.style.setProperty('--bg-blur', `${val}px`);
      localStorage.setItem('lyrics-bg-blur', val.toString());
    });

    this.sliderBlur.addEventListener('change', async () => {
      const file = await this.storage.loadImage();
      this.dispatchBgUpdate(file);
    });
  }

  private loadSettings(): void {
    const savedDarkness = localStorage.getItem('lyrics-bg-darkness');
    const savedBlur = localStorage.getItem('lyrics-bg-blur');

    const darkness = savedDarkness !== null ? parseInt(savedDarkness, 10) : 60;
    const blur = savedBlur !== null ? parseInt(savedBlur, 10) : 15;

    // Apply values to inputs
    this.sliderDarkness.value = darkness.toString();
    this.labelDarknessValue.textContent = `${darkness}%`;
    this.bgImageElement.style.setProperty('--bg-brightness', (1 - darkness / 100).toFixed(2));

    this.sliderBlur.value = blur.toString();
    this.labelBlurValue.textContent = `${blur}px`;
    this.bgImageElement.style.setProperty('--bg-blur', `${blur}px`);
  }

  private async loadPersistedImage(): Promise<void> {
    try {
      const file = await this.storage.loadImage();
      if (file) {
        this.setBackgroundImage(file);
      }
    } catch (err) {
      console.error('Failed to load persisted background image:', err);
    }
  }

  private setBackgroundImage(file: File): void {
    if (this.currentBgUrl) {
      URL.revokeObjectURL(this.currentBgUrl);
    }
    this.currentBgUrl = URL.createObjectURL(file);
    this.bgImageElement.style.backgroundImage = `url(${this.currentBgUrl})`;
    this.bgImageElement.classList.add('has-image');
    this.btnClearBg.classList.remove('hidden');
  }

  private dispatchBgUpdate(file: File | null): void {
    const darkness = parseInt(this.sliderDarkness.value, 10);
    const blur = parseInt(this.sliderBlur.value, 10);
    const event = new CustomEvent('bg-update', {
      detail: { file, darkness, blur }
    });
    window.dispatchEvent(event);
  }
}
