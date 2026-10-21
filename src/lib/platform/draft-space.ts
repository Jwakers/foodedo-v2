// A store captures this key synchronously before any asynchronous storage work.
// Changing context cannot retarget an operation already in flight.
let draftSpaceKey = "current";
export function setDraftSpaceKey(key: string) {
  draftSpaceKey = key;
}
export function getDraftSpaceKey() {
  return draftSpaceKey;
}
