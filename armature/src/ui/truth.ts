import { GLASS, METALS } from '../config/materials';

const glass = GLASS.soda_lime_96.cte;
const metalRange = () => {
  const v = Object.values(METALS).map((m) => m.cte);
  return `${Math.min(...v)}–${Math.max(...v)}`;
};

/** The glass truth panel. Every number comes from the materials table; shop practice is labelled as such. */
export function truthHTML(): string {
  return `
<div class="truth">
  <p><b>Why glass and metal usually can't be fused.</b> As a joint cools, each material shrinks at its own rate.
  COE 96 glass is about ${glass} ×10⁻⁶/°C; the metals in this app are about ${metalRange()} ×10⁻⁶/°C.
  The difference locks stress into the joint, glass is weak in tension, and the joint usually cracks — sometimes after it has cooled.</p>
  <p><b>The exceptions.</b></p>
  <ul>
    <li>Thin foil or fine wire fully encased in glass: the metal is thin enough to give instead of cracking the glass. Results depend on the metal and glass — test first.</li>
    <li>Special sealing alloys matched to particular glasses, and platinum, are used in scientific and lamp glass. These are not practical for most hot-shop work.</li>
  </ul>
  <p><b>Cold connections</b> (joined after the glass is annealed):</p>
  <ul>
    <li><b>Clips</b> — a metal clip, ideally with a pad, holding the glass by friction or shape.</li>
    <li><b>Standoffs</b> — a post from the frame or wall with a gasket where it meets the glass.</li>
    <li><b>Bolts</b> — through diamond-drilled holes, with rubber, neoprene or nylon washers so metal never bears directly on glass.</li>
    <li><b>Wire wraps</b> — wire looped around a neck or notch formed in the glass.</li>
    <li><b>Mechanical capture</b> — glass shaped so it can't come out, like a form blown into a cage. The blow itself is hot contact.</li>
  </ul>
  <p class="muted">Padding glass from metal, keeping holes well back from edges, and preheating a cage before blowing into it are common shop practice, not hard rules. Ask your shop.</p>
</div>`;
}

export const SETTING_INFO: Record<string, { label: string; unit: string; step: number; help: string }> = {
  POINT_LOAD_KG: { label: 'Point load limit', unit: 'kg', step: 0.1, help: 'Load on one clip, bolt or standoff before thin glass gets a warning.' },
  THIN_GLASS_MM: { label: 'Thin glass below', unit: 'mm', step: 0.5, help: 'Glass thinner than this counts as thin for point loads.' },
  HOLE_EDGE_FACTOR: { label: 'Hole-to-edge factor', unit: '× thickness', step: 0.5, help: 'Minimum hole centre to edge distance, as a multiple of glass thickness. A common rule of thumb.' },
  TIP_MARGIN: { label: 'Tip margin', unit: 'of base width', step: 0.05, help: 'Warn when the centre of mass is this close to the base edge (0.1 = 10%).' },
  ANCHOR_KG: { label: 'Load per wall anchor', unit: 'kg', step: 0.5, help: 'Depends entirely on your wall and fixing. Check the fixing’s rating.' },
  CANTILEVER_MM: { label: 'Cantilever limit', unit: 'mm', step: 10, help: 'How far the centre of mass may sit out from the wall.' },
};
