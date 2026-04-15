export function isReviewBuild() {
  // __DEV__ é true em:
  // - Expo Go
  // - EAS internal
  // - EAS preview
  // - TestFlight
  return __DEV__ === true;
}
