// Walk-in customers and ticket generation (GDD §6). MVP: one customer type.
import { FRITS } from './config.js';
import { pick, range } from './rng.js';

const FIRST = ['Ada', 'Bo', 'Cass', 'Dov', 'Edie', 'Fen', 'Gus', 'Hollis', 'Iris', 'Jojo', 'Kit', 'Lark', 'Milo', 'Nell', 'Oz', 'Perry', 'Quinn', 'Rosa', 'Sol', 'Tam', 'Uma', 'Vic', 'Wren', 'Yara'];
const SKIN = ['#F3D2B3', '#E0B48E', '#C68E64', '#9A6544', '#6E452E', '#F7E0CB'];
const HAIR = ['#2B1E1A', '#5A3825', '#A8642F', '#D9B48C', '#8A8F95', '#B5563A', '#3B3F66'];
const SHIRT = ['#4FA65A', '#3B7DBF', '#F2A03D', '#C8323A', '#7A4FB0', '#2BB3B1', '#D9B48C'];
const LINES_TAKE = ['Hi! Could I get…', 'Morning! I’d love…', 'Ooh, it’s warm in here. I’ll take…', 'Is it true you make these by hand? I want…'];

export function customersPerDay(cfg, day) {
  const c = cfg.customers;
  return Math.max(c.BASE, Math.min(c.MAX, c.BASE + Math.floor(day * c.PER_DAY)));
}

// Arrival times in seconds from opening (GDD §6.2), with a lunch rush.
export function buildSchedule(cfg, day, rng) {
  const d = cfg.day, c = cfg.customers;
  const n = customersPerDay(cfg, day);
  const usable = d.LENGTH_S - d.LAST_CALL_S;
  const gap = (usable - d.FIRST_ARRIVAL_S) / n;
  const hoursPerS = (d.CLOSE_HOUR - d.OPEN_HOUR) / d.LENGTH_S;
  const times = [];
  let t = d.FIRST_ARRIVAL_S;
  for (let i = 0; i < n && t < usable; i++) {
    times.push(t);
    const hour = d.OPEN_HOUR + t * hoursPerS;
    const rush = hour >= d.RUSH[0] && hour < d.RUSH[1] ? c.RUSH_MULT : 1;
    t += gap * rush * range(rng, c.JITTER[0], c.JITTER[1]);
  }
  return times;
}

export function makeCustomer(rng, id) {
  return {
    id,
    name: pick(rng, FIRST),
    look: { skin: pick(rng, SKIN), hair: pick(rng, HAIR), shirt: pick(rng, SHIRT), hairStyle: Math.floor(rng() * 3) },
    line: pick(rng, LINES_TAKE),
    weights: {},
    patienceMult: 1,
    tipMult: 1,
  };
}

export function makeTicket(cfg, day, rng) {
  const frit = pick(rng, FRITS);
  const doses = day >= cfg.customers.DENSITY_FROM_DAY ? 1 + Math.floor(rng() * 3) : 1;
  const product = cfg.products.tumbler;
  const complexity = doses - 1;
  return {
    form: 'tumbler',
    size: 'M',
    frit: frit.id,
    doses,
    lip: 'straight',
    price: product.price + 4 * complexity,
    patienceS: product.soloBuildS * cfg.customers.PATIENCE_MULT,
  };
}

export const DENSITY_LABEL = ['', 'Light', 'Medium', 'Deep'];
