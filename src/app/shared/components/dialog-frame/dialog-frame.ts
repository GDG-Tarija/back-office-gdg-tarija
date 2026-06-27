import { Component, input, output, signal, computed, OnInit } from '@angular/core';

export type DialogSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
};

@Component({
  selector: 'app-dialog-frame',
  standalone: true,
  imports: [],
  templateUrl: './dialog-frame.html',
  styleUrl: './dialog-frame.scss',
})
export class DialogFrame implements OnInit {
  title = input.required<string>();
  icon = input<string>('edit');
  initialSize = input<DialogSize>('md');

  closeDialog = output<void>();

  readonly state = signal<'normal' | 'fullscreen'>('normal');
  readonly currentSize = signal<DialogSize>('md');

  readonly isFullscreen = computed(() => this.state() === 'fullscreen');
  readonly sizeClass = computed(() =>
    this.isFullscreen()
      ? 'w-full h-full max-w-none rounded-none'
      : SIZE_CLASSES[this.currentSize()],
  );

  ngOnInit(): void {
    this.currentSize.set(this.initialSize());
  }

  toggleFullscreen(): void {
    this.state.set(this.isFullscreen() ? 'normal' : 'fullscreen');
  }

  setSize(size: DialogSize): void {
    this.currentSize.set(size);
  }

  close(): void {
    this.closeDialog.emit();
  }
}
