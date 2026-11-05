import { evaluateOps, type Evaluation } from '../engine/evaluate';
import { useDesign } from './designStore';

let last: { ops: unknown; draft: boolean; result: Evaluation } | null = null;

/**
 * The evaluated design. Every panel calls this, so the result is shared: one rebuild
 * per change, not one per panel. Melts drop to draft resolution during a drag.
 */
export function useEvaluation(): Evaluation {
  const ops = useDesign((s) => s.design.ops);
  const draft = useDesign((s) => s.dragging);
  if (last?.ops !== ops || last.draft !== draft) last = { ops, draft, result: evaluateOps(ops, { draft }) };
  return last.result;
}
