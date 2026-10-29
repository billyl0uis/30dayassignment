// A starting process plan for a hand-blown perfume bottle, made in three
// parts: the body, the neck finished for its closure, and (for a ground
// stopper) the stopper, made separately. It is a TEMPLATE to edit, not a
// procedure: the steps are the usual order of work, and every detail
// (temperatures, times, tools, who does what) is left for the maker.

export const TEMPLATE_NOTE = 'Template only. Edit every step to match your shop, your glass and your annealing schedule.'

const body = [
  ['Gather and blow the body', ''],
  ['Shape the body', 'For a flat or oval body: paddle or flatten here.'],
  ['Form the shoulder and neck', ''],
  ['Transfer to the punty', ''],
]

const neck = {
  stopper: [
    ['Open the neck to take the stopper', 'Leave stock for grinding.'],
    ['Anneal', 'TODO: your schedule.'],
    ['Grind the neck and stopper shank together', 'Cold shop. Mark the pair: the stopper fits this bottle only.'],
  ],
  cork: [
    ['Size the neck bore to the cork', 'Check against the cork you will use.'],
    ['Anneal', 'TODO: your schedule.'],
  ],
  hardware: [
    ['Form the neck finish', "To the supplier's spec sheet."],
    ['Anneal', 'TODO: your schedule.'],
    ['Check the neck against the spec', 'Finish cold (grind, polish) if it is out of tolerance.'],
  ],
}

const stopper = [
  ['Gather and form the stopper head', ''],
  ['Pull and shape the shank', 'Leave stock for grinding.'],
  ['Add the dauber', 'Only if the design has one.'],
  ['Anneal', 'TODO: your schedule.'],
]

const steps = (part, rows) => rows.map(([title, note], i) => ({ id: `${part}-${i + 1}`, part, title, note, done: false }))

export function processTemplate(closureType) {
  return {
    template: true,
    note: TEMPLATE_NOTE,
    steps: [...steps('body', body), ...steps('neck', neck[closureType] ?? []), ...(closureType === 'stopper' ? steps('stopper', stopper) : [])],
  }
}
