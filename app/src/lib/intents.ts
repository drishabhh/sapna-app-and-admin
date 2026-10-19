/** Tiny bridge for "open X" requests that can arrive before the target screen has mounted (cold start from a notification). */
let wantSteps = false;
export function requestSteps() {
  wantSteps = true;
  document.dispatchEvent(new Event('open-steps'));
}
export function takeStepsRequest(): boolean {
  const w = wantSteps;
  wantSteps = false;
  return w;
}
