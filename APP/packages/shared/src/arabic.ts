/**
 * Arabic counting is not "number + noun". A count selects between five forms,
 * and the wrong one is the first thing a native reader notices. Both the API
 * (queue reasons) and the web app (counts on screen) build these strings, so
 * the rule lives here rather than being written twice and drifting.
 */
export interface ArabicNounForms {
  /** zero */
  none: string;
  /** exactly one */
  one: string;
  /** exactly two — Arabic has a real dual */
  two: string;
  /** 3–10, and any number ending 3–10 */
  few: string;
  /** 11 and above */
  many: string;
}

/**
 * Unicode bidi isolate — the plain-text equivalent of `<span dir="ltr">`.
 * These strings are built server-side and stored as text, so they cannot carry
 * markup. Without it "-18" renders as "18-" inside an Arabic sentence, and a
 * mis-signed temperature in a regulatory record is not a cosmetic bug.
 */
export function isolateLtr(value: string): string {
  return `⁦${value}⁩`;
}

export function arabicCount(n: number, forms: ArabicNounForms): string {
  if (n === 0) return forms.none;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const noun = n <= 10 ? forms.few : forms.many;
  return `${isolateLtr(String(n))} ${noun}`;
}

export const VIOLATION_FORMS: ArabicNounForms = {
  none: 'بلا مخالفات',
  one: 'مخالفة واحدة',
  two: 'مخالفتان',
  few: 'مخالفات',
  many: 'مخالفة',
};

export const OPEN_VIOLATION_FORMS: ArabicNounForms = {
  none: 'بلا مخالفات مفتوحة',
  one: 'مخالفة واحدة مفتوحة',
  two: 'مخالفتان مفتوحتان',
  few: 'مخالفات مفتوحة',
  many: 'مخالفة مفتوحة',
};

export const ESTABLISHMENT_FORMS: ArabicNounForms = {
  none: 'لا منشآت',
  one: 'منشأة واحدة',
  two: 'منشأتان',
  few: 'منشآت',
  many: 'منشأة',
};

export const PENDING_INSPECTION_FORMS: ArabicNounForms = {
  none: 'لا شيء بانتظار الإرسال',
  one: 'تفتيش واحد بانتظار الإرسال',
  two: 'تفتيشان بانتظار الإرسال',
  few: 'تفتيشات بانتظار الإرسال',
  many: 'تفتيشاً بانتظار الإرسال',
};

export const DAY_FORMS: ArabicNounForms = {
  none: 'اليوم',
  one: 'يوم واحد',
  two: 'يومان',
  few: 'أيام',
  many: 'يوماً',
};
