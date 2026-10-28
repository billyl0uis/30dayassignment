/* Vitrigraph Lab: safety card. General guidance only; follow your studio's rules and your kiln's manual. */
(function (VL) {
  const CARD = `
    <div class="vg-card" role="dialog" aria-modal="true" aria-labelledby="vg-safety-h">
      <div class="vg-kicker">Before a real pull</div>
      <h2 id="vg-safety-h">Safety card</h2>
      <p style="color:var(--muted);margin:4px 0 8px">This game is a simplified model. Real vitrigraph work means a kiln that's open, hot and working above your hands for hours.</p>
      <ul>
        <li><b>The kiln is live and hot.</b> The pot, the kiln floor, the hole and the underside of the kiln stay hot long after the glass stops moving. Many kilns don't cut power to the elements when you open them. Switch the kiln off before reaching inside with metal tools, unless its manual says otherwise.</li>
        <li><b>Heat comes out the bottom.</b> The hole radiates heat straight down. Keep your face, hair and forearms out of the line under it, and reach in from the side.</li>
        <li><b>Looking into a hot kiln.</b> Glowing kilns give off bright light and infrared, which can damage your eyes over time. Wear eye protection rated for infrared from hot glass and kilns. Lenses made only to cut sodium flare are not enough on their own. Keep your looks short.</li>
        <li><b>Hot glass looks cold.</b> The thick start of a pull and any gob stay hot well after they stop glowing. Assume every piece is hot until you've checked it safely. Thin stringer cools fast and its snapped ends are sharp and can fly.</li>
        <li><b>Dress for it.</b> Natural-fiber clothing, closed shoes, hair tied back, nothing dangling. Keep a clear, heat-safe surface under the kiln for dropped gobs, and nothing flammable nearby.</li>
        <li><b>Air.</b> Ventilate the room. Kiln wash, fiber products and some colors can give off dust or fumes. Check the safety data for what you use.</li>
        <li><b>Burns.</b> Cool a burn under cool running water and get medical help for anything serious. Know where the first-aid kit and fire extinguisher are before you start.</li>
        <li><b>Compatibility and annealing.</b> Mixing glass with different COEs can crack the cane later. Ask experienced people whether your thicker cane needs annealing.</li>
        <li><b>Learn it in person first.</b> Do your first pulls alongside someone who has done them.</li>
      </ul>
      <button class="vg-btn primary" data-a="ok">Got it</button>
    </div>`;

  function show(app) {
    app.modal.innerHTML = CARD;
    app.modal.hidden = false;
    const close = () => { app.modal.hidden = true; app.modal.innerHTML = ''; VL.store.set('safetySeen', true); };
    app.modal.querySelector('[data-a=ok]').addEventListener('click', close);
    app.modal.addEventListener('click', e => { if (e.target === app.modal) close(); }, { once: true });
    app.modal.querySelector('[data-a=ok]').focus();
  }

  VL.safety = { show, showFirstTime(app) { if (!VL.store.get('safetySeen', false)) show(app); } };
})(window.VitrigraphLab);
