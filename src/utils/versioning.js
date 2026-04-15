export function compareVersions(a = "", b = "") {
  const pa = String(a)
    .split(".")
    .map((n) => Number(n || 0));
  const pb = String(b)
    .split(".")
    .map((n) => Number(n || 0));
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;

    if (va > vb) return 1;
    if (va < vb) return -1;
  }

  return 0;
}
