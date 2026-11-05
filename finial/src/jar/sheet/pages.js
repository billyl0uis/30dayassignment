// Paper for the shop sheet, in mm.
export const PAGES = {
  letter: { w: 215.9, h: 279.4, label: 'US Letter', css: 'letter' },
  a4: { w: 210, h: 297, label: 'A4', css: 'A4' },
}

// System fonts: a PNG can't load web fonts, and print and PNG should match.
export const SHEET_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif'
