export function focusActivatedRegion(event: MouseEvent, region: HTMLElement | null): void {
  if (document.activeElement === event.currentTarget) {
    region?.focus({ preventScroll: true });
  }
}
