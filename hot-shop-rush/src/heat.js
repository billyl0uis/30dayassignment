// Heat model (GDD §4). Pure functions on a plain piece object, no DOM.

export function createPiece(cfg, size = 'M') {
  return {
    size,
    heat: cfg.heat.H_START,
    lipHeat: null,
    stress: 0,
    stressPeak: 0,
    off: 0,
    offPeak: 0,
    offFloor: 0,
    massMult: 1,
    cracked: false,
  };
}

// Newton-style cooling: fast when hot, slow near ambient (GDD §4.2).
export function coolRate(h, H, size, contact = 'air', massMult = 1) {
  const norm = (H - h.H_AMBIENT) / (h.H_REF - h.H_AMBIENT);
  return h.COOL_BASE * h.sizeMult[size] * (h.contactMult[contact] ?? 1) * massMult * Math.max(0, norm);
}

// Glory hole reheat slows as it approaches GH_TARGET (GDD §4.4).
export function reheatRate(h, H, size, mult = 1) {
  const norm = (h.GH_TARGET - H) / (h.GH_TARGET - h.H_REF);
  return Math.max(0, h.GH_RATE * h.sizeReheatMult[size] * mult * norm);
}

export function addStress(p, amt) {
  p.stress = Math.min(100, p.stress + amt);
  p.stressPeak = Math.max(p.stressPeak, p.stress);
}

export function addOff(p, amt) {
  p.off = Math.min(100, p.off + amt);
  p.offPeak = Math.max(p.offPeak, p.off);
}

export function correctOff(cfg, p, dt) {
  p.off = Math.max(p.offFloor, p.off - cfg.heat.OFF_CORRECT_RATE * dt);
}

export function inBand(H, band) {
  return H >= band[0] && H <= band[1];
}

/**
 * Advance one piece by dt seconds.
 * env.garage    – parked in the garage kiln: drift toward H_GARAGE, nothing else.
 * env.reheating – in the glory hole (past the travel delay).
 * env.lipMode   – only the lip is in the glory hole (Station 4 lip step).
 * env.contact   – key into contactMult while a tool or the marver touches the glass.
 */
export function tickPiece(cfg, p, dt, env = {}) {
  const h = cfg.heat;

  if (env.garage) {
    const g = cfg.garage;
    const d = g.H_GARAGE - p.heat;
    p.heat += Math.sign(d) * Math.min(Math.abs(d), g.DRIFT * dt);
    if (p.lipHeat != null) p.lipHeat = p.heat;
    return p;
  }

  if (env.reheating) {
    if (env.lipMode && p.lipHeat != null) {
      p.lipHeat += reheatRate(h, p.lipHeat, p.size, h.LIP_REHEAT_MULT) * dt;
      p.heat += reheatRate(h, p.heat, p.size, h.BODY_REHEAT_WHILE_LIP) * dt;
    } else {
      p.heat += reheatRate(h, p.heat, p.size) * dt;
      if (p.lipHeat != null) p.lipHeat += reheatRate(h, p.lipHeat, p.size) * dt;
    }
    if (p.heat >= h.STRESS_RELIEF_MIN_HEAT) {
      const floor = p.stressPeak * h.STRESS_FLOOR_FRACTION;
      if (p.stress > floor) p.stress = Math.max(floor, p.stress - h.STRESS_RELIEF_RATE * dt);
    }
  } else {
    p.heat -= coolRate(h, p.heat, p.size, env.contact, p.massMult) * dt;
    if (p.lipHeat != null) p.lipHeat -= coolRate(h, p.lipHeat, p.size, 'air', p.massMult) * h.LIP_COOL_MULT * dt;
  }

  if (p.heat < h.STRESS_COLD_LINE) {
    addStress(p, h.STRESS_COLD_RATE * ((h.STRESS_COLD_LINE - p.heat) / 10) * dt);
  }
  // The pipe auto-turns in the glory hole, so slumping there is much slower.
  if (p.heat > h.SLUMP_THRESHOLD) addOff(p, h.OFF_SLUMP_RATE * (env.reheating ? h.OFF_SLUMP_GH_MULT : 1) * dt);
  if (p.heat <= h.CRACK_INSTANT) p.cracked = true;
  return p;
}
