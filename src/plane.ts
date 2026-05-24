export function setupPlane() {
  const el = document.getElementById("plane") as unknown as SVGSVGElement | null;
  if (!el) throw new Error("#plane element missing");
  return {
    setBank(deg: number) {
      // Slight damping so the visual lean stays subtle
      el.style.transform = `rotate(${deg * 0.85}deg)`;
    },
  };
}
