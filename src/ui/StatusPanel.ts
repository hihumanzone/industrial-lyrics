/**
 * Panel to display overlay status, error, and success messages to the user.
 */
export class StatusPanel {
  private element: HTMLElement;
  private timeoutId: number | null = null;

  constructor() {
    this.element = document.getElementById('status-message') as HTMLElement;
    if (!this.element) {
      // Fallback if element not found in HTML
      this.element = document.createElement('div');
      this.element.id = 'status-message';
      this.element.className = 'status-message hidden';
      document.body.appendChild(this.element);
    }
  }

  /**
   * Displays a temporary notification message on the screen.
   * @param message Text to display
   * @param type Style type: 'success' | 'error' | 'info'
   * @param duration Duration in milliseconds to show the message (default 4000ms)
   */
  public showMessage(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 4000): void {
    // Clear previous timeouts
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
    }

    // Set class name based on type
    this.element.className = 'status-message';
    if (type === 'error') {
      this.element.classList.add('error');
    } else if (type === 'success') {
      this.element.classList.add('success');
    }

    this.element.textContent = message;
    this.element.classList.remove('hidden');

    // Auto-hide after duration
    this.timeoutId = window.setTimeout(() => {
      this.hide();
    }, duration);
  }

  /**
   * Instantly hides the status message.
   */
  public hide(): void {
    this.element.classList.add('hidden');
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
