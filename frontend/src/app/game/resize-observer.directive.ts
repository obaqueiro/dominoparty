import { Directive, ElementRef, EventEmitter, Output, OnDestroy, OnInit } from '@angular/core';

export interface ResizeEvent {
  width: number;
  height: number;
}

@Directive({
  selector: '[appResizeObserver]',
  standalone: true
})
export class ResizeObserverDirective implements OnInit, OnDestroy {
  @Output() appResizeObserver = new EventEmitter<ResizeEvent>();
  private resizeObserver: ResizeObserver;

  constructor(private elementRef: ElementRef) {
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        this.appResizeObserver.emit({ width, height });
      }
    });
  }

  ngOnInit(): void {
    this.resizeObserver.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
  }
} 