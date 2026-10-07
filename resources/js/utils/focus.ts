export function focusRetryRegion(event: MouseEvent, region: HTMLElement | null): void {
  if (document.activeElement === event.currentTarget) {
    region?.focus({ preventScroll: true });
  }
}
