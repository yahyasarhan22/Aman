import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  output,
  viewChild,
} from '@angular/core';
import { T } from '../core/strings';

/** Pointer events cover mouse, touch and stylus in one handler. */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad">
      <canvas
        #canvas
        width="600"
        height="200"
        (pointerdown)="start($event)"
        (pointermove)="move($event)"
        (pointerup)="end()"
        (pointerleave)="end()"
      ></canvas>
      <div class="pad__foot">
        <span class="pad__hint">{{ t.review.signatureHint }}</span>
        <button type="button" class="pad__clear" (click)="clear()">
          {{ t.review.clearSignature }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .pad {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      canvas {
        inline-size: 100%;
        block-size: 160px;
        background: var(--card);
        border: 1.5px solid var(--rule-strong);
        border-radius: var(--radius);
        touch-action: none;
        cursor: crosshair;
      }

      .pad__foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        font-size: 13px;
        color: var(--ink-muted);
      }

      .pad__clear {
        border: 0;
        background: none;
        padding: var(--s1) 0;
        color: var(--ink);
        text-decoration: underline;
        cursor: pointer;
      }
    `,
  ],
})
export class SignaturePadComponent {
  readonly t = T;
  readonly changed = output<string | null>();

  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private drawing = false;
  private dirty = false;

  private ctx(): CanvasRenderingContext2D {
    const ctx = this.canvasRef().nativeElement.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f3d3e';
    return ctx;
  }

  private point(event: PointerEvent): [number, number] {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * canvas.width,
      ((event.clientY - rect.top) / rect.height) * canvas.height,
    ];
  }

  start(event: PointerEvent): void {
    event.preventDefault();
    this.drawing = true;
    const ctx = this.ctx();
    ctx.beginPath();
    ctx.moveTo(...this.point(event));
  }

  move(event: PointerEvent): void {
    if (!this.drawing) return;
    event.preventDefault();
    const ctx = this.ctx();
    ctx.lineTo(...this.point(event));
    ctx.stroke();
    this.dirty = true;
  }

  end(): void {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.dirty) this.changed.emit(this.canvasRef().nativeElement.toDataURL('image/png'));
  }

  clear(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx().clearRect(0, 0, canvas.width, canvas.height);
    this.dirty = false;
    this.changed.emit(null);
  }
}
