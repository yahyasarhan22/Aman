import type { Severity } from '@aman/shared';

export interface SeedChecklistItem {
  section: number;
  sectionNameAr: string;
  code: string;
  labelAr: string;
  severity: Severity;
  requiresMeasurement?: boolean;
  unit?: string;
  threshold?: string;
  recommendationTemplate: string;
}

const S1 = 'النظافة الشخصية';
const S2 = 'ضبط الحرارة';
const S3 = 'التخزين والصلاحية';
const S4 = 'نظافة المكان';
const S5 = 'مكافحة الحشرات';

/** Spec §5.5: five sections, 25 items. Wording lives in the database — the
 *  municipality changes it without a deployment. */
export const CHECKLIST_V1: SeedChecklistItem[] = [
  {
    section: 1,
    sectionNameAr: S1,
    code: '1.1',
    labelAr: 'بطاقات صحية سارية المفعول لجميع العاملين',
    severity: 'MAJOR',
    recommendationTemplate:
      'استخرج بطاقات صحية سارية لجميع العاملين من مديرية الصحة وأرفق نسخاً خلال {deadline}.',
  },
  {
    section: 1,
    sectionNameAr: S1,
    code: '1.2',
    labelAr: 'ملابس عمل نظيفة وأغطية رأس',
    severity: 'MINOR',
    recommendationTemplate: 'وفّر ملابس عمل نظيفة وأغطية رأس لكل عامل خلال {deadline}.',
  },
  {
    section: 1,
    sectionNameAr: S1,
    code: '1.3',
    labelAr: 'مغسلة أيدٍ مجهّزة بالصابون ومناشف تُستعمل مرة واحدة',
    severity: 'MAJOR',
    recommendationTemplate:
      'جهّز مغسلة الأيدي بالصابون والمناشف الورقية وماء جارٍ خلال {deadline}.',
  },
  {
    section: 1,
    sectionNameAr: S1,
    code: '1.4',
    labelAr: 'عدم ملامسة الطعام الجاهز باليد المجرّدة',
    severity: 'CRITICAL',
    recommendationTemplate:
      'أوقف ملامسة الطعام الجاهز باليد فوراً واستخدم القفازات أو الملاقط. المهلة {deadline}.',
  },
  {
    section: 1,
    sectionNameAr: S1,
    code: '1.5',
    labelAr: 'منع العمل أثناء المرض أو وجود جروح مكشوفة',
    severity: 'MAJOR',
    recommendationTemplate:
      'امنع العاملين المصابين بجروح مكشوفة أو أعراض مرضية من ملامسة الطعام خلال {deadline}.',
  },

  {
    section: 2,
    sectionNameAr: S2,
    code: '2.1',
    labelAr: 'التخزين البارد عند {threshold}° مئوية أو أقل',
    severity: 'CRITICAL',
    requiresMeasurement: true,
    unit: '°C',
    threshold: '4',
    recommendationTemplate:
      'اضبط التبريد إلى أقل من {threshold}° مئوية. القراءة المسجلة: {measured}°. إذا تعذّر على الوحدة الثبات على الحرارة فاستبدلها خلال {deadline}.',
  },
  {
    section: 2,
    sectionNameAr: S2,
    code: '2.2',
    labelAr: 'الحفظ الساخن عند {threshold}° مئوية أو أكثر',
    severity: 'CRITICAL',
    requiresMeasurement: true,
    unit: '°C',
    threshold: '60',
    recommendationTemplate:
      'ارفع حرارة الحفظ الساخن إلى {threshold}° مئوية أو أكثر. القراءة المسجلة: {measured}°. المهلة {deadline}.',
  },
  {
    section: 2,
    sectionNameAr: S2,
    code: '2.3',
    labelAr: 'الفريزر يعمل عند {threshold}° مئوية أو أقل',
    severity: 'MAJOR',
    requiresMeasurement: true,
    unit: '°C',
    threshold: '-18',
    recommendationTemplate:
      'أصلح الفريزر ليثبت عند {threshold}° مئوية أو أقل. القراءة المسجلة: {measured}°. المهلة {deadline}.',
  },
  {
    section: 2,
    sectionNameAr: S2,
    code: '2.4',
    labelAr: 'ميزان حرارة متوفر وصالح للاستعمال',
    severity: 'MINOR',
    recommendationTemplate:
      'وفّر ميزان حرارة معايَراً لكل وحدة تبريد وسجّل القراءات يومياً خلال {deadline}.',
  },

  {
    section: 3,
    sectionNameAr: S3,
    code: '3.1',
    labelAr: 'لا توجد مواد منتهية الصلاحية في مناطق الخدمة',
    severity: 'CRITICAL',
    recommendationTemplate:
      'أتلف جميع المواد منتهية الصلاحية فوراً ووثّق الإتلاف. المهلة {deadline}.',
  },
  {
    section: 3,
    sectionNameAr: S3,
    code: '3.2',
    labelAr: 'فصل اللحوم النيئة عن الأطعمة الجاهزة',
    severity: 'CRITICAL',
    recommendationTemplate:
      'افصل تخزين اللحوم النيئة عن الأطعمة الجاهزة برفوف سفلية مخصصة وحاويات مغلقة خلال {deadline}.',
  },
  {
    section: 3,
    sectionNameAr: S3,
    code: '3.3',
    labelAr: 'المواد الغذائية مرفوعة عن الأرض ١٥ سم على الأقل',
    severity: 'MAJOR',
    recommendationTemplate: 'ارفع جميع المواد الغذائية عن الأرض على منصات أو رفوف خلال {deadline}.',
  },
  {
    section: 3,
    sectionNameAr: S3,
    code: '3.4',
    labelAr: 'الحاويات معنونة بتاريخ الإنتاج والصلاحية',
    severity: 'MINOR',
    recommendationTemplate:
      'ضع بطاقة على كل حاوية تحمل المحتوى وتاريخ الإنتاج والصلاحية خلال {deadline}.',
  },
  {
    section: 3,
    sectionNameAr: S3,
    code: '3.5',
    labelAr: 'فصل مواد التنظيف والكيماويات عن المواد الغذائية',
    severity: 'MAJOR',
    recommendationTemplate:
      'انقل مواد التنظيف إلى خزانة منفصلة مقفلة بعيداً عن المواد الغذائية خلال {deadline}.',
  },

  {
    section: 4,
    sectionNameAr: S4,
    code: '4.1',
    labelAr: 'أسطح التحضير نظيفة وسليمة وغير متشققة',
    severity: 'MAJOR',
    recommendationTemplate:
      'نظّف أو استبدل أسطح التحضير المتضررة بأسطح غير منفذة وسهلة التنظيف خلال {deadline}.',
  },
  {
    section: 4,
    sectionNameAr: S4,
    code: '4.2',
    labelAr: 'الأرضيات والمصارف نظيفة وتصرّف المياه بشكل سليم',
    severity: 'MAJOR',
    recommendationTemplate: 'نظّف المصارف وأصلح تصريف المياه الراكدة خلال {deadline}.',
  },
  {
    section: 4,
    sectionNameAr: S4,
    code: '4.3',
    labelAr: 'حاويات النفايات مغطاة وتُفرَّغ بانتظام',
    severity: 'MINOR',
    recommendationTemplate: 'وفّر حاويات نفايات مغطاة وحدّد جدول تفريغ يومي خلال {deadline}.',
  },
  {
    section: 4,
    sectionNameAr: S4,
    code: '4.4',
    labelAr: 'التهوية وشفاطات الدهون تعمل ونظيفة',
    severity: 'MINOR',
    recommendationTemplate: 'نظّف الشفاطات والمرشحات وأصلح التهوية خلال {deadline}.',
  },
  {
    section: 4,
    sectionNameAr: S4,
    code: '4.5',
    labelAr: 'دورات المياه نظيفة ومزوّدة بالماء والصابون',
    severity: 'MAJOR',
    recommendationTemplate:
      'جهّز دورات المياه بالماء الجاري والصابون ووسائل التجفيف ونظّفها يومياً خلال {deadline}.',
  },
  {
    section: 4,
    sectionNameAr: S4,
    code: '4.6',
    labelAr: 'مصدر مياه صالح للشرب ولا توجد تسريبات',
    severity: 'CRITICAL',
    recommendationTemplate:
      'أوقف استخدام المياه غير الصالحة فوراً وأصلح مصدر المياه أو التسريب. المهلة {deadline}.',
  },

  {
    section: 5,
    sectionNameAr: S5,
    code: '5.1',
    labelAr: 'لا توجد حشرات أو قوارض حية',
    severity: 'CRITICAL',
    recommendationTemplate:
      'نفّذ مكافحة فورية بواسطة شركة مرخّصة وأرفق التقرير. المهلة {deadline}.',
  },
  {
    section: 5,
    sectionNameAr: S5,
    code: '5.2',
    labelAr: 'لا توجد مخلّفات أو آثار قوارض',
    severity: 'MAJOR',
    recommendationTemplate:
      'نظّف المناطق المتأثرة وعقّمها ثم أعد الفحص خلال {deadline}.',
  },
  {
    section: 5,
    sectionNameAr: S5,
    code: '5.3',
    labelAr: 'منافذ الدخول مغلقة والفتحات مشبّكة',
    severity: 'MAJOR',
    recommendationTemplate:
      'أغلق الفجوات حول الأبواب والأنابيب وركّب شبكاً على الفتحات خلال {deadline}.',
  },
  {
    section: 5,
    sectionNameAr: S5,
    code: '5.4',
    labelAr: 'عقد مكافحة حشرات ساري مع سجل زيارات',
    severity: 'MINOR',
    recommendationTemplate:
      'وقّع عقداً مع شركة مكافحة مرخّصة واحتفظ بسجل الزيارات خلال {deadline}.',
  },
  {
    section: 5,
    sectionNameAr: S5,
    code: '5.5',
    labelAr: 'محيط المنشأة خالٍ من تجمّعات النفايات',
    severity: 'MINOR',
    recommendationTemplate: 'أزل تجمّعات النفايات من محيط المنشأة خلال {deadline}.',
  },
];
