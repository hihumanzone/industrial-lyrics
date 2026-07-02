/**
 * Helper utilities for client-side file loading and validation.
 */

// Supported browser audio MIME types and extensions
const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'];

/**
 * Checks if a file is a supported audio format.
 */
export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  
  const nameLower = file.name.toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some(ext => nameLower.endsWith(ext));
}

/**
 * Checks if a file has a .lrc extension.
 */
export function isLrcFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.lrc');
}

/**
 * Manages object URL lifecycles to prevent memory leaks.
 */
export class AudioManager {
  private currentUrl: string | null = null;

  /**
   * Creates an object URL for a given file. Revokes any previously created URL.
   */
  public createAudioUrl(file: File): string {
    this.revokeCurrentUrl();
    this.currentUrl = URL.createObjectURL(file);
    return this.currentUrl;
  }

  /**
   * Revokes the current object URL if one exists.
   */
  public revokeCurrentUrl(): void {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }
}

/**
 * Reads a text file locally using the FileReader API.
 */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        resolve(text);
      } else {
        reject(new Error('File content could not be read as text.'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('FileReader encountered an error reading the file.'));
    };
    
    reader.readAsText(file);
  });
}

export class BgImageStorage {
  private dbName = 'LyricsBgDB';
  private storeName = 'bgImageStore';
  private dbVersion = 1;

  private getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(this.storeName);
      };
    });
  }

  public async saveImage(file: File): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(file, 'backgroundImage');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async loadImage(): Promise<File | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get('backgroundImage');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  public async clearImage(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete('backgroundImage');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
