/**
 * A DOM overlay dialogue box nine-sliced from a Kenney UI panel via CSS
 * `border-image`. Lives above the canvas; the game loop drives it through
 * {@link start} / {@link advance} and reads {@link open} to lock movement.
 */
export class DialogueBox {
  private readonly hintEl: HTMLElement;

  private index = 0;
  private lines: string[] = [];
  private readonly nameEl: HTMLElement;
  open = false;
  private readonly root: HTMLElement;
  private readonly textEl: HTMLElement;

  constructor(parent: HTMLElement, panelUrl: string) {
    this.root = document.createElement('div');
    this.root.style.cssText = [
      'position:absolute',
      'left:16px',
      'right:16px',
      'bottom:16px',
      'box-sizing:border-box',
      'min-height:96px',
      'padding:18px 22px',
      'display:none',
      'flex-direction:column',
      'gap:8px',
      'color:#1b1f2a',
      'font:16px/1.4 system-ui,sans-serif',
      'image-rendering:pixelated',
      `border-image:url(${panelUrl}) 24 fill / 24px / 0 stretch`,
      'border-style:solid',
      'border-width:24px',
      'pointer-events:none',
    ].join(';');

    this.nameEl = document.createElement('div');
    this.nameEl.style.cssText = 'font-weight:700;font-size:15px;color:#2a3550;letter-spacing:.02em';

    this.textEl = document.createElement('div');
    this.textEl.style.cssText = 'flex:1';

    this.hintEl = document.createElement('div');
    this.hintEl.style.cssText = 'align-self:flex-end;font-size:12px;color:#55607a';

    this.root.append(this.nameEl, this.textEl, this.hintEl);
    parent.append(this.root);
  }

  /** Advances to the next line, closing after the last. */
  advance(): void {
    if (!this.open)
      return;
    this.index++;
    if (this.index >= this.lines.length) {
      this.close();
      return;
    }
    this.render();
  }

  close(): void {
    this.open = false;
    this.root.style.display = 'none';
  }

  private render(): void {
    this.textEl.textContent = this.lines[this.index] ?? '';
    const last = this.index === this.lines.length - 1;
    this.hintEl.textContent = last ? '▶ Space to close' : '▶ Space to continue';
  }

  /** Opens the box on the first line of a conversation. */
  start(name: string, lines: string[]): void {
    this.lines = lines;
    this.index = 0;
    this.open = true;
    this.nameEl.textContent = name;
    this.root.style.display = 'flex';
    this.render();
  }
}
