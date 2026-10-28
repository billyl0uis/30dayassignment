/* Vitrigraph Lab: debrief. Turns what happened into cause-and-effect sentences tied to your choices. */
(function (VL) {
  const C = VL.config, M = VL.model;
  const name = id => M.colorById(id).name.toLowerCase();

  // Every candidate sentence, each tagged with a kind and a weight (how much it shaped this result).
  function findings(app, A) {
    const run = app.run, st = run.pull || {}, out = [];
    const shape = M.loadShape(run.charge), sum = M.chargeSummary(run.charge);
    const add = (id, kind, weight, text) => out.push({ id, kind, weight, text });
    const drops = (st.drops || 0) + run.heat.gobDrops;

    if (st.snaps) add('snap', 'pull', 0.9 + 0.05 * st.snaps,
      `The strand tore ${st.snaps === 1 ? 'once' : `${st.snaps} times`}: you pulled at up to ${A.peakSpeed.toFixed(0)} cm/s while the glass was only ${M.band(A.meanIx)}. Stiffer glass can't stretch that fast. Slow the pull or add heat.`);
    if (drops) add('drop', 'heat', 0.85,
      `${drops === 1 ? 'A gob' : `${drops} gobs`} fell while the glass hung there hot. That glass came out of the middle of the pot first, so the colors loaded higher up showed up sooner than you'd expect.`);
    if (A.droopFrac > 0.15) add('droop', 'pull', 0.7,
      `About ${Math.round(A.droopFrac * 100)}% of the length is lumpy because the glass was runny and the pull was slow. Hot glass needs a faster, steadier pull, or turn the kiln down.`);
    if (A.segs.length && A.cv > 0.25) add('uneven', 'pull', 0.75,
      `The diameter went from ${A.minD.toFixed(1)} to ${A.maxD.toFixed(1)} mm because your pull speed went from ${A.minSpeed.toFixed(0)} to ${A.maxSpeed.toFixed(0)} cm/s. Diameter follows 1/√speed: pull twice as fast and the strand gets about 30% thinner.`);
    if (A.segs.length && A.cv <= 0.12 && A.totalMm > 300) add('even', 'pull', 0.6,
      `A steady pull near ${(A.segs.reduce((a, s) => a + s.speed * s.len, 0) / A.totalMm).toFixed(0)} cm/s kept the strand within ${Math.round(A.cv * 100)}% of ${A.meanD.toFixed(1)} mm.`);
    if (shape.layered) {
      const layers = shape.layerColor.filter(Boolean);
      const bottom = layers[0], top = layers[layers.length - 1];
      if (bottom && top && bottom !== 'mixed' && top !== 'mixed' && bottom !== top)
        add('layer', 'load', 0.8, `You stacked ${name(top)} over ${name(bottom)}. The middle of the pot drains faster than the edges, so ${name(top)} came through first as a core inside ${name(bottom)} and took over from there, not as a clean switch.`);
    }
    if (shape.cored) add('core', 'load', 0.65,
      'Colors you placed in different rings kept their order through the hole: the center of the pot became the center of the cane, and the wall became the casing.');
    if (shape.sideBySide) add('side', 'load', 0.6, st.twistOn
      ? 'The side-by-side colors came out as stripes, and twisting while you pulled wound them into a spiral along the length.'
      : 'Colors loaded side by side stayed side by side, as wedges in the slice and stripes along the length.');
    if (sum.forms.includes('frit')) add('frit', 'load', 0.45,
      'Frit traps air between the grains. The white dots in the slices are seeds (small bubbles).');
    if (sum.coes.length > 1 || sum.coes.includes('?')) add('coe', 'load', 0.95,
      `This load mixed ${sum.coes.map(c => c === '?' ? 'unknown' : `COE ${c}`).join(' and ')} glass. In real glass that cane would likely crack as it cooled, possibly days later, however good it looks now.`);
    const o = M.orifice(run.orifice);
    if (o.inches > C.orificeRefInches && A.meanIx > 0.55) add('hole', 'heat', 0.55,
      `The ${o.label} hole plus hot glass let a lot through, so at the same pull speed the strand came out thicker.`);
    if (o.shape === 'slot') add('slot', 'heat', 0.5, 'The slot hole squashed the cross-section into a ribbon. The colors keep their order but stretch sideways.');
    if (A.segs.length && A.meanIx < 0.3) add('cold', 'heat', 0.5,
      `The glass stayed ${M.band(A.meanIx)} (hottest ${M.toDisplay(run.heat.maxGlass)}), so little came out and you had to pull slowly to avoid tearing.`);
    return out;
  }

  // Choose the one or two sentences the player actually sees.
  // findings: [{ id, kind: 'load'|'heat'|'pull', weight: 0–1, text }]
  // challenge: the active challenge id ('free', 'stringer', 'change', 'core', 'recipe')
  function pickDebrief(findings, challenge) {
    // TODO(human): choose which 1–2 findings to show, and in what order.
    return findings.slice(0, 2);
  }

  VL.debrief = { findings, pickDebrief };
})(window.VitrigraphLab);
