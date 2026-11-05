import { CJK_MAPPING } from './smpCjkMapper.ts'

export interface SymbolEntry {
  encodedStr: string
  unicodeChar: string
  desc: string
  category: string
}

export function getCategory(desc: string): string {
  if (desc.includes('GREEK CAPITAL')) return 'Greek Capital'
  if (desc.includes('GREEK SMALL')) return 'Greek Small'
  if (desc.includes('CYRILLIC CAPITAL')) return 'Cyrillic Capital'
  if (desc.includes('CYRILLIC SMALL')) return 'Cyrillic Small'
  if (desc.includes('BOX DRAWINGS')) return 'Box Drawings'
  if (desc.includes('IDEOGRAPHIC') || desc.includes('KATAKANA') || desc.includes('HIRAGANA')) return 'CJK Symbols'
  if (desc.includes('FULLWIDTH') || desc.includes('HALFWIDTH')) return 'Fullwidth/Halfwidth'
  return 'Math & Symbols'
}

const characterMapping = [
    ['\u00A7', '\u0081\u02DC', 'SECTION SIGN'],
    ['\u00A8', '\u0081N', 'DIAERESIS'],
    ['\u00B0', '\u0081\u2039', 'DEGREE SIGN'],
    ['\u00B1', '\u0081}', 'PLUS-MINUS SIGN'],
    ['\u00B4', '\u0081L', 'ACUTE ACCENT'],
    ['\u00B6', '\u0081\u00F7', 'PILCROW SIGN'],
    ['\u00D7', '\u0081~', 'MULTIPLICATION SIGN'],
    ['\u00F7', '\u0081\u20AC', 'DIVISION SIGN'],

    ['\u0391', '\u0192\u0178', 'GREEK CAPITAL LETTER ALPHA'],
    ['\u0392', '\u0192\u00A0', 'GREEK CAPITAL LETTER BETA'],
    ['\u0393', '\u0192\u00A1', 'GREEK CAPITAL LETTER GAMMA'],
    ['\u0394', '\u0192\u00A2', 'GREEK CAPITAL LETTER DELTA'],
    ['\u0395', '\u0192\u00A3', 'GREEK CAPITAL LETTER EPSILON'],
    ['\u0396', '\u0192\u00A4', 'GREEK CAPITAL LETTER ZETA'],
    ['\u0397', '\u0192\u00A5', 'GREEK CAPITAL LETTER ETA'],
    ['\u0398', '\u0192\u00A6', 'GREEK CAPITAL LETTER THETA'],
    ['\u0399', '\u0192\u00A7', 'GREEK CAPITAL LETTER IOTA'],
    ['\u039A', '\u0192\u00A8', 'GREEK CAPITAL LETTER KAPPA'],
    ['\u039B', '\u0192\u00A9', 'GREEK CAPITAL LETTER LAMDA'],
    ['\u039C', '\u0192\u00AA', 'GREEK CAPITAL LETTER MU'],
    ['\u039D', '\u0192\u00AB', 'GREEK CAPITAL LETTER NU'],
    ['\u039E', '\u0192\u00AC', 'GREEK CAPITAL LETTER XI'],
    ['\u039F', '\u0192\u00AD', 'GREEK CAPITAL LETTER OMICRON'],
    ['\u03A0', '\u0192\u00AE', 'GREEK CAPITAL LETTER PI'],
    ['\u03A1', '\u0192\u00AF', 'GREEK CAPITAL LETTER RHO'],
    ['\u03A3', '\u0192\u00B0', 'GREEK CAPITAL LETTER SIGMA'],
    ['\u03A4', '\u0192\u00B1', 'GREEK CAPITAL LETTER TAU'],
    ['\u03A5', '\u0192\u00B2', 'GREEK CAPITAL LETTER UPSILON'],
    ['\u03A6', '\u0192\u00B3', 'GREEK CAPITAL LETTER PHI'],
    ['\u03A7', '\u0192\u00B4', 'GREEK CAPITAL LETTER CHI'],
    ['\u03A8', '\u0192\u00B5', 'GREEK CAPITAL LETTER PSI'],
    ['\u03A9', '\u0192\u00B6', 'GREEK CAPITAL LETTER OMEGA'],

    ['\u03B1', '\u0192\u00BF', 'GREEK SMALL LETTER ALPHA'],
    ['\u03B2', '\u0192\u00C0', 'GREEK SMALL LETTER BETA'],
    ['\u03B3', '\u0192\u00C1', 'GREEK SMALL LETTER GAMMA'],
    ['\u03B4', '\u0192\u00C2', 'GREEK SMALL LETTER DELTA'],
    ['\u03B5', '\u0192\u00C3', 'GREEK SMALL LETTER EPSILON'],
    ['\u03B6', '\u0192\u00C4', 'GREEK SMALL LETTER ZETA'],
    ['\u03B7', '\u0192\u00C5', 'GREEK SMALL LETTER ETA'],
    ['\u03B8', '\u0192\u00C6', 'GREEK SMALL LETTER THETA'],
    ['\u03B9', '\u0192\u00C7', 'GREEK SMALL LETTER IOTA'],
    ['\u03BA', '\u0192\u00C8', 'GREEK SMALL LETTER KAPPA'],
    ['\u03BB', '\u0192\u00C9', 'GREEK SMALL LETTER LAMDA'],
    ['\u03BC', '\u0192\u00CA', 'GREEK SMALL LETTER MU'],
    ['\u03BD', '\u0192\u00CB', 'GREEK SMALL LETTER NU'],
    ['\u03BE', '\u0192\u00CC', 'GREEK SMALL LETTER XI'],
    ['\u03BF', '\u0192\u00CD', 'GREEK SMALL LETTER OMICRON'],
    ['\u03C0', '\u0192\u00CE', 'GREEK SMALL LETTER PI'],
    ['\u03C1', '\u0192\u00CF', 'GREEK SMALL LETTER RHO'],
    ['\u03C3', '\u0192\u00D0', 'GREEK SMALL LETTER SIGMA'],
    ['\u03C4', '\u0192\u00D1', 'GREEK SMALL LETTER TAU'],
    ['\u03C5', '\u0192\u00D2', 'GREEK SMALL LETTER UPSILON'],
    ['\u03C6', '\u0192\u00D3', 'GREEK SMALL LETTER PHI'],
    ['\u03C7', '\u0192\u00D4', 'GREEK SMALL LETTER CHI'],
    ['\u03C8', '\u0192\u00D5', 'GREEK SMALL LETTER PSI'],
    ['\u03C9', '\u0192\u00D6', 'GREEK SMALL LETTER OMEGA'],

    ['\u0401', '\u201EF', 'CYRILLIC CAPITAL LETTER IO'],
    ['\u0410', '\u201E@', 'CYRILLIC CAPITAL LETTER A'],
    ['\u0411', '\u201EA', 'CYRILLIC CAPITAL LETTER BE'],
    ['\u0412', '\u201EB', 'CYRILLIC CAPITAL LETTER VE'],
    ['\u0413', '\u201EC', 'CYRILLIC CAPITAL LETTER GHE'],
    ['\u0414', '\u201ED', 'CYRILLIC CAPITAL LETTER DE'],
    ['\u0415', '\u201EE', 'CYRILLIC CAPITAL LETTER IE'],
    ['\u0416', '\u201EG', 'CYRILLIC CAPITAL LETTER ZHE'],
    ['\u0417', '\u201EH', 'CYRILLIC CAPITAL LETTER ZE'],
    ['\u0418', '\u201EI', 'CYRILLIC CAPITAL LETTER I'],
    ['\u0419', '\u201EJ', 'CYRILLIC CAPITAL LETTER SHORT I'],
    ['\u041A', '\u201EK', 'CYRILLIC CAPITAL LETTER KA'],
    ['\u041B', '\u201EL', 'CYRILLIC CAPITAL LETTER EL'],
    ['\u041C', '\u201EM', 'CYRILLIC CAPITAL LETTER EM'],
    ['\u041D', '\u201EN', 'CYRILLIC CAPITAL LETTER EN'],
    ['\u041E', '\u201EO', 'CYRILLIC CAPITAL LETTER O'],
    ['\u041F', '\u201EP', 'CYRILLIC CAPITAL LETTER PE'],
    ['\u0420', '\u201EQ', 'CYRILLIC CAPITAL LETTER ER'],
    ['\u0421', '\u201ER', 'CYRILLIC CAPITAL LETTER ES'],
    ['\u0422', '\u201ES', 'CYRILLIC CAPITAL LETTER TE'],
    ['\u0423', '\u201ET', 'CYRILLIC CAPITAL LETTER U'],
    ['\u0424', '\u201EU', 'CYRILLIC CAPITAL LETTER EF'],
    ['\u0425', '\u201EV', 'CYRILLIC CAPITAL LETTER HA'],
    ['\u0426', '\u201EW', 'CYRILLIC CAPITAL LETTER TSE'],
    ['\u0427', '\u201EX', 'CYRILLIC CAPITAL LETTER CHE'],
    ['\u0428', '\u201EY', 'CYRILLIC CAPITAL LETTER SHA'],
    ['\u0429', '\u201EZ', 'CYRILLIC CAPITAL LETTER SHCHA'],
    ['\u042A', '\u201E[', 'CYRILLIC CAPITAL LETTER HARD SIGN'],
    ['\u042B', '\u201E\\', 'CYRILLIC CAPITAL LETTER YERU'],
    ['\u042C', '\u201E]', 'CYRILLIC CAPITAL LETTER SOFT SIGN'],
    ['\u042D', '\u201E^', 'CYRILLIC CAPITAL LETTER E'],
    ['\u042E', '\u201E_', 'CYRILLIC CAPITAL LETTER YU'],
    ['\u042F', '\u201E`', 'CYRILLIC CAPITAL LETTER YA'],

    ['\u0430', '\u201Ep', 'CYRILLIC SMALL LETTER A'],
    ['\u0431', '\u201Eq', 'CYRILLIC SMALL LETTER BE'],
    ['\u0432', '\u201Er', 'CYRILLIC SMALL LETTER VE'],
    ['\u0433', '\u201Es', 'CYRILLIC SMALL LETTER GHE'],
    ['\u0434', '\u201Et', 'CYRILLIC SMALL LETTER DE'],
    ['\u0435', '\u201Eu', 'CYRILLIC SMALL LETTER IE'],
    ['\u0436', '\u201Ew', 'CYRILLIC SMALL LETTER ZHE'],
    ['\u0437', '\u201Ex', 'CYRILLIC SMALL LETTER ZE'],
    ['\u0438', '\u201Ey', 'CYRILLIC SMALL LETTER I'],
    ['\u0439', '\u201Ez', 'CYRILLIC SMALL LETTER SHORT I'],
    ['\u043A', '\u201E{', 'CYRILLIC SMALL LETTER KA'],
    ['\u043B', '\u201E|', 'CYRILLIC SMALL LETTER EL'],
    ['\u043C', '\u201E}', 'CYRILLIC SMALL LETTER EM'],
    ['\u043D', '\u201E~', 'CYRILLIC SMALL LETTER EN'],
    ['\u043E', '\u201E\u20AC', 'CYRILLIC SMALL LETTER O'],
    ['\u043F', '\u201E\u0081', 'CYRILLIC SMALL LETTER PE'],
    ['\u0440', '\u201E\u201A', 'CYRILLIC SMALL LETTER ER'],
    ['\u0441', '\u201E\u0192', 'CYRILLIC SMALL LETTER ES'],
    ['\u0442', '\u201E\u201E', 'CYRILLIC SMALL LETTER TE'],
    ['\u0443', '\u201E\u2026', 'CYRILLIC SMALL LETTER U'],
    ['\u0444', '\u201E\u2020', 'CYRILLIC SMALL LETTER EF'],
    ['\u0445', '\u201E\u2021', 'CYRILLIC SMALL LETTER HA'],
    ['\u0446', '\u201E\u02C6', 'CYRILLIC SMALL LETTER TSE'],
    ['\u0447', '\u201E\u2030', 'CYRILLIC SMALL LETTER CHE'],
    ['\u0448', '\u201E\u0160', 'CYRILLIC SMALL LETTER SHA'],
    ['\u0449', '\u201E\u2039', 'CYRILLIC SMALL LETTER SHCHA'],
    ['\u044A', '\u201E\u0152', 'CYRILLIC SMALL LETTER HARD SIGN'],
    ['\u044B', '\u201E\u008D', 'CYRILLIC SMALL LETTER YERU'],
    ['\u044C', '\u201E\u017D', 'CYRILLIC SMALL LETTER SOFT SIGN'],
    ['\u044D', '\u201E\u008F', 'CYRILLIC SMALL LETTER E'],
    ['\u044E', '\u201E\u0090', 'CYRILLIC SMALL LETTER YU'],
    ['\u044F', '\u201E\u2018', 'CYRILLIC SMALL LETTER YA'],
    ['\u0451', '\u201Ev', 'CYRILLIC SMALL LETTER IO'],

    ['\u2010', '\u0081]', 'HYPHEN'],
    ['\u2015', '\u0081\\', 'HORIZONTAL BAR'],
    ['\u2018', '\u0081e', 'LEFT SINGLE QUOTATION MARK'],
    ['\u2019', '\u0081f', 'RIGHT SINGLE QUOTATION MARK'],
    ['\u201C', '\u0081g', 'LEFT DOUBLE QUOTATION MARK'],
    ['\u201D', '\u0081h', 'RIGHT DOUBLE QUOTATION MARK'],
    ['\u2020', '\u0081\u00F5', 'DAGGER'],
    ['\u2021', '\u0081\u00F6', 'DOUBLE DAGGER'],
    ['\u2025', '\u0081d', 'TWO DOT LEADER'],
    ['\u2026', '\u0081c', 'HORIZONTAL ELLIPSIS'],
    ['\u2030', '\u0081\u00F1', 'PER MILLE SIGN'],
    ['\u2032', '\u0081\u0152', 'PRIME'],
    ['\u2033', '\u0081\u008D', 'DOUBLE PRIME'],
    ['\u203B', '\u0081\u00A6', 'REFERENCE MARK'],
    ['\u2103', '\u0081\u017D', 'DEGREE CELSIUS'],
    ['\u212B', '\u0081\u00F0', 'ANGSTROM SIGN'],

    ['\u2190', '\u0081\u00A9', 'LEFTWARDS ARROW'],
    ['\u2191', '\u0081\u00AA', 'UPWARDS ARROW'],
    ['\u2192', '\u0081\u00A8', 'RIGHTWARDS ARROW'],
    ['\u2193', '\u0081\u00AB', 'DOWNWARDS ARROW'],
    ['\u21D2', '\u0081\u00CB', 'RIGHTWARDS DOUBLE ARROW'],
    ['\u21D4', '\u0081\u00CC', 'LEFT RIGHT DOUBLE ARROW'],
    ['\u2200', '\u0081\u00CD', 'FOR ALL'],
    ['\u2202', '\u0081\u00DD', 'PARTIAL DIFFERENTIAL'],
    ['\u2203', '\u0081\u00CE', 'THERE EXISTS'],
    ['\u2207', '\u0081\u00DE', 'NABLA'],
    ['\u2208', '\u0081\u00B8', 'ELEMENT OF'],
    ['\u220B', '\u0081\u00B9', 'CONTAINS AS MEMBER'],
    ['\u221A', '\u0081\u00E3', 'SQUARE ROOT'],
    ['\u221D', '\u0081\u00E5', 'PROPORTIONAL TO'],
    ['\u221E', '\u0081\u2021', 'INFINITY'],
    ['\u2220', '\u0081\u00DA', 'ANGLE'],
    ['\u2227', '\u0081\u00C8', 'LOGICAL AND'],
    ['\u2228', '\u0081\u00C9', 'LOGICAL OR'],
    ['\u2229', '\u0081\u00BF', 'INTERSECTION'],
    ['\u222A', '\u0081\u00BE', 'UNION'],
    ['\u222B', '\u0081\u00E7', 'INTEGRAL'],
    ['\u222C', '\u0081\u00E8', 'DOUBLE INTEGRAL'],
    ['\u2234', '\u0081\u02C6', 'THEREFORE'],
    ['\u2235', '\u0081\u00E6', 'BECAUSE'],
    ['\u223D', '\u0081\u00E4', 'REVERSED TILDE'],
    ['\u2252', '\u0081\u00E0', 'APPROXIMATELY EQUAL TO OR THE IMAGE OF'],
    ['\u2260', '\u0081\u201A', 'NOT EQUAL TO'],
    ['\u2261', '\u0081\u00DF', 'IDENTICAL TO'],
    ['\u2266', '\u0081\u2026', 'LESS-THAN OVER EQUAL TO'],
    ['\u2267', '\u0081\u2020', 'GREATER-THAN OVER EQUAL TO'],
    ['\u226A', '\u0081\u00E1', 'MUCH LESS-THAN'],
    ['\u226B', '\u0081\u00E2', 'MUCH GREATER-THAN'],
    ['\u2282', '\u0081\u00BC', 'SUBSET OF'],
    ['\u2283', '\u0081\u00BD', 'SUPERSET OF'],
    ['\u2286', '\u0081\u00BA', 'SUBSET OF OR EQUAL TO'],
    ['\u2287', '\u0081\u00BB', 'SUPERSET OF OR EQUAL TO'],
    ['\u22A5', '\u0081\u00DB', 'UP TACK'],
    ['\u2312', '\u0081\u00DC', 'ARC'],

    ['\u2500', '\u201E\u0178', 'BOX DRAWINGS LIGHT HORIZONTAL'],
    ['\u2501', '\u201E\u00AA', 'BOX DRAWINGS HEAVY HORIZONTAL'],
    ['\u2502', '\u201E\u00A0', 'BOX DRAWINGS LIGHT VERTICAL'],
    ['\u2503', '\u201E\u00AB', 'BOX DRAWINGS HEAVY VERTICAL'],
    ['\u250C', '\u201E\u00A1', 'BOX DRAWINGS LIGHT DOWN AND RIGHT'],
    ['\u250F', '\u201E\u00AC', 'BOX DRAWINGS HEAVY DOWN AND RIGHT'],
    ['\u2510', '\u201E\u00A2', 'BOX DRAWINGS LIGHT DOWN AND LEFT'],
    ['\u2513', '\u201E\u00AD', 'BOX DRAWINGS HEAVY DOWN AND LEFT'],
    ['\u2514', '\u201E\u00A4', 'BOX DRAWINGS LIGHT UP AND RIGHT'],
    ['\u2517', '\u201E\u00AF', 'BOX DRAWINGS HEAVY UP AND RIGHT'],
    ['\u2518', '\u201E\u00A3', 'BOX DRAWINGS LIGHT UP AND LEFT'],
    ['\u251B', '\u201E\u00AE', 'BOX DRAWINGS HEAVY UP AND LEFT'],
    ['\u251C', '\u201E\u00A5', 'BOX DRAWINGS LIGHT VERTICAL AND RIGHT'],
    ['\u251D', '\u201E\u00BA', 'BOX DRAWINGS VERTICAL LIGHT AND RIGHT HEAVY'],
    ['\u2520', '\u201E\u00B5', 'BOX DRAWINGS VERTICAL HEAVY AND RIGHT LIGHT'],
    ['\u2523', '\u201E\u00B0', 'BOX DRAWINGS HEAVY VERTICAL AND RIGHT'],
    ['\u2524', '\u201E\u00A7', 'BOX DRAWINGS LIGHT VERTICAL AND LEFT'],
    ['\u2525', '\u201E\u00BC', 'BOX DRAWINGS VERTICAL LIGHT AND LEFT HEAVY'],
    ['\u2528', '\u201E\u00B7', 'BOX DRAWINGS VERTICAL HEAVY AND LEFT LIGHT'],
    ['\u252B', '\u201E\u00B2', 'BOX DRAWINGS HEAVY VERTICAL AND LEFT'],
    ['\u252C', '\u201E\u00A6', 'BOX DRAWINGS LIGHT DOWN AND HORIZONTAL'],
    ['\u252F', '\u201E\u00B6', 'BOX DRAWINGS DOWN LIGHT AND HORIZONTAL HEAVY'],
    ['\u2530', '\u201E\u00BB', 'BOX DRAWINGS DOWN HEAVY AND HORIZONTAL LIGHT'],
    ['\u2533', '\u201E\u00B1', 'BOX DRAWINGS HEAVY DOWN AND HORIZONTAL'],
    ['\u2534', '\u201E\u00A8', 'BOX DRAWINGS LIGHT UP AND HORIZONTAL'],
    ['\u2537', '\u201E\u00B8', 'BOX DRAWINGS UP LIGHT AND HORIZONTAL HEAVY'],
    ['\u2538', '\u201E\u00BD', 'BOX DRAWINGS UP HEAVY AND HORIZONTAL LIGHT'],
    ['\u253B', '\u201E\u00B3', 'BOX DRAWINGS HEAVY UP AND HORIZONTAL'],
    ['\u253C', '\u201E\u00A9', 'BOX DRAWINGS LIGHT VERTICAL AND HORIZONTAL'],
    ['\u253F', '\u201E\u00B9', 'BOX DRAWINGS VERTICAL LIGHT AND HORIZONTAL HEAVY'],
    ['\u2542', '\u201E\u00BE', 'BOX DRAWINGS VERTICAL HEAVY AND HORIZONTAL LIGHT'],
    ['\u254B', '\u201E\u00B4', 'BOX DRAWINGS HEAVY VERTICAL AND HORIZONTAL'],

    ['\u25A0', '\u0081\u00A1', 'BLACK SQUARE'],
    ['\u25A1', '\u0081\u00A0', 'WHITE SQUARE'],
    ['\u25B2', '\u0081\u00A3', 'BLACK UP-POINTING TRIANGLE'],
    ['\u25B3', '\u0081\u00A2', 'WHITE UP-POINTING TRIANGLE'],
    ['\u25BC', '\u0081\u00A5', 'BLACK DOWN-POINTING TRIANGLE'],
    ['\u25BD', '\u0081\u00A4', 'WHITE DOWN-POINTING TRIANGLE'],
    ['\u25C6', '\u0081\u0178', 'BLACK DIAMOND'],
    ['\u25C7', '\u0081\u017E', 'WHITE DIAMOND'],
    ['\u25CB', '\u0081\u203A', 'WHITE CIRCLE'],
    ['\u25CE', '\u0081\u009D', 'BULLSEYE'],
    ['\u25CF', '\u0081\u0153', 'BLACK CIRCLE'],
    ['\u25EF', '\u0081\u00FC', 'LARGE CIRCLE'],
    ['\u2605', '\u0081\u0161', 'BLACK STAR'],
    ['\u2606', '\u0081\u2122', 'WHITE STAR'],
    ['\u2640', '\u0081\u0160', 'FEMALE SIGN'],
    ['\u2642', '\u0081\u2030', 'MALE SIGN'],
    ['\u266A', '\u0081\u00F4', 'EIGHTH NOTE'],
    ['\u266D', '\u0081\u00F3', 'MUSIC FLAT SIGN'],
    ['\u266F', '\u0081\u00F2', 'MUSIC SHARP SIGN'],

    ['\u3041', '\u201A\u0178', 'HIRAGANA LETTER SMALL A'],
    ['\u3042', '\u201A\u00A0', 'HIRAGANA LETTER A'],
    ['\u3043', '\u201A\u00A1', 'HIRAGANA LETTER SMALL I'],
    ['\u3044', '\u201A\u00A2', 'HIRAGANA LETTER I'],
    ['\u3045', '\u201A\u00A3', 'HIRAGANA LETTER SMALL U'],
    ['\u3046', '\u201A\u00A4', 'HIRAGANA LETTER U'],
    ['\u3047', '\u201A\u00A5', 'HIRAGANA LETTER SMALL E'],
    ['\u3048', '\u201A\u00A6', 'HIRAGANA LETTER E'],
    ['\u3049', '\u201A\u00A7', 'HIRAGANA LETTER SMALL O'],
    ['\u304A', '\u201A\u00A8', 'HIRAGANA LETTER O'],
    ['\u304B', '\u201A\u00A9', 'HIRAGANA LETTER KA'],
    ['\u304C', '\u201A\u00AA', 'HIRAGANA LETTER GA'],
    ['\u304D', '\u201A\u00AB', 'HIRAGANA LETTER KI'],
    ['\u304E', '\u201A\u00AC', 'HIRAGANA LETTER GI'],
    ['\u304F', '\u201A\u00AD', 'HIRAGANA LETTER KU'],
    ['\u3050', '\u201A\u00AE', 'HIRAGANA LETTER GU'],
    ['\u3051', '\u201A\u00AF', 'HIRAGANA LETTER KE'],
    ['\u3052', '\u201A\u00B0', 'HIRAGANA LETTER GE'],
    ['\u3053', '\u201A\u00B1', 'HIRAGANA LETTER KO'],
    ['\u3054', '\u201A\u00B2', 'HIRAGANA LETTER GO'],
    ['\u3055', '\u201A\u00B3', 'HIRAGANA LETTER SA'],
    ['\u3056', '\u201A\u00B4', 'HIRAGANA LETTER ZA'],
    ['\u3057', '\u201A\u00B5', 'HIRAGANA LETTER SI'],
    ['\u3058', '\u201A\u00B6', 'HIRAGANA LETTER ZI'],
    ['\u3059', '\u201A\u00B7', 'HIRAGANA LETTER SU'],
    ['\u305A', '\u201A\u00B8', 'HIRAGANA LETTER ZU'],
    ['\u305B', '\u201A\u00B9', 'HIRAGANA LETTER SE'],
    ['\u305C', '\u201A\u00BA', 'HIRAGANA LETTER ZE'],
    ['\u305D', '\u201A\u00BB', 'HIRAGANA LETTER SO'],
    ['\u305E', '\u201A\u00BC', 'HIRAGANA LETTER ZO'],
    ['\u305F', '\u201A\u00BD', 'HIRAGANA LETTER TA'],
    ['\u3060', '\u201A\u00BE', 'HIRAGANA LETTER DA'],
    ['\u3061', '\u201A\u00BF', 'HIRAGANA LETTER TI'],
    ['\u3062', '\u201A\u00C0', 'HIRAGANA LETTER DI'],
    ['\u3063', '\u201A\u00C1', 'HIRAGANA LETTER SMALL TU'],
    ['\u3064', '\u201A\u00C2', 'HIRAGANA LETTER TU'],
    ['\u3065', '\u201A\u00C3', 'HIRAGANA LETTER DU'],
    ['\u3066', '\u201A\u00C4', 'HIRAGANA LETTER TE'],
    ['\u3067', '\u201A\u00C5', 'HIRAGANA LETTER DE'],
    ['\u3068', '\u201A\u00C6', 'HIRAGANA LETTER TO'],
    ['\u3069', '\u201A\u00C7', 'HIRAGANA LETTER DO'],
    ['\u306A', '\u201A\u00C8', 'HIRAGANA LETTER NA'],
    ['\u306B', '\u201A\u00C9', 'HIRAGANA LETTER NI'],
    ['\u306C', '\u201A\u00CA', 'HIRAGANA LETTER NU'],
    ['\u306D', '\u201A\u00CB', 'HIRAGANA LETTER NE'],
    ['\u306E', '\u201A\u00CC', 'HIRAGANA LETTER NO'],
    ['\u306F', '\u201A\u00CD', 'HIRAGANA LETTER HA'],
    ['\u3070', '\u201A\u00CE', 'HIRAGANA LETTER BA'],
    ['\u3071', '\u201A\u00CF', 'HIRAGANA LETTER PA'],
    ['\u3072', '\u201A\u00D0', 'HIRAGANA LETTER HI'],
    ['\u3073', '\u201A\u00D1', 'HIRAGANA LETTER BI'],
    ['\u3074', '\u201A\u00D2', 'HIRAGANA LETTER PI'],
    ['\u3075', '\u201A\u00D3', 'HIRAGANA LETTER HU'],
    ['\u3076', '\u201A\u00D4', 'HIRAGANA LETTER BU'],
    ['\u3077', '\u201A\u00D5', 'HIRAGANA LETTER PU'],
    ['\u3078', '\u201A\u00D6', 'HIRAGANA LETTER HE'],
    ['\u3079', '\u201A\u00D7', 'HIRAGANA LETTER BE'],
    ['\u307A', '\u201A\u00D8', 'HIRAGANA LETTER PE'],
    ['\u307B', '\u201A\u00D9', 'HIRAGANA LETTER HO'],
    ['\u307C', '\u201A\u00DA', 'HIRAGANA LETTER BO'],
    ['\u307D', '\u201A\u00DB', 'HIRAGANA LETTER PO'],
    ['\u307E', '\u201A\u00DC', 'HIRAGANA LETTER MA'],
    ['\u307F', '\u201A\u00DD', 'HIRAGANA LETTER MI'],
    ['\u3080', '\u201A\u00DE', 'HIRAGANA LETTER MU'],
    ['\u3081', '\u201A\u00DF', 'HIRAGANA LETTER ME'],
    ['\u3082', '\u201A\u00E0', 'HIRAGANA LETTER MO'],
    ['\u3083', '\u201A\u00E1', 'HIRAGANA LETTER SMALL YA'],
    ['\u3084', '\u201A\u00E2', 'HIRAGANA LETTER YA'],
    ['\u3085', '\u201A\u00E3', 'HIRAGANA LETTER SMALL YU'],
    ['\u3086', '\u201A\u00E4', 'HIRAGANA LETTER YU'],
    ['\u3087', '\u201A\u00E5', 'HIRAGANA LETTER SMALL YO'],
    ['\u3088', '\u201A\u00E6', 'HIRAGANA LETTER YO'],
    ['\u3089', '\u201A\u00E7', 'HIRAGANA LETTER RA'],
    ['\u308A', '\u201A\u00E8', 'HIRAGANA LETTER RI'],
    ['\u308B', '\u201A\u00E9', 'HIRAGANA LETTER RU'],
    ['\u308C', '\u201A\u00EA', 'HIRAGANA LETTER RE'],
    ['\u308D', '\u201A\u00EB', 'HIRAGANA LETTER RO'],
    ['\u308E', '\u201A\u00EC', 'HIRAGANA LETTER SMALL WA'],
    ['\u308F', '\u201A\u00ED', 'HIRAGANA LETTER WA'],
    ['\u3090', '\u201A\u00EE', 'HIRAGANA LETTER WI'],
    ['\u3091', '\u201A\u00EF', 'HIRAGANA LETTER WE'],
    ['\u3092', '\u201A\u00F0', 'HIRAGANA LETTER WO'],
    ['\u3093', '\u201A\u00F1', 'HIRAGANA LETTER N'],
    ['\u309B', '\u0081J', 'KATAKANA-HIRAGANA VOICED SOUND MARK'],
    ['\u309C', '\u0081K', 'KATAKANA-HIRAGANA SEMI-VOICED SOUND MARK'],
    ['\u309D', '\u0081T', 'HIRAGANA ITERATION MARK'],
    ['\u309E', '\u0081U', 'HIRAGANA VOICED ITERATION MARK'],

    ['\u30A1', '\u0192@', 'KATAKANA LETTER SMALL A'],
    ['\u30A2', '\u0192A', 'KATAKANA LETTER A'],
    ['\u30A3', '\u0192B', 'KATAKANA LETTER SMALL I'],
    ['\u30A4', '\u0192C', 'KATAKANA LETTER I'],
    ['\u30A5', '\u0192D', 'KATAKANA LETTER SMALL U'],
    ['\u30A6', '\u0192E', 'KATAKANA LETTER U'],
    ['\u30A7', '\u0192F', 'KATAKANA LETTER SMALL E'],
    ['\u30A8', '\u0192G', 'KATAKANA LETTER E'],
    ['\u30A9', '\u0192H', 'KATAKANA LETTER SMALL O'],
    ['\u30AA', '\u0192I', 'KATAKANA LETTER O'],
    ['\u30AB', '\u0192J', 'KATAKANA LETTER KA'],
    ['\u30AC', '\u0192K', 'KATAKANA LETTER GA'],
    ['\u30AD', '\u0192L', 'KATAKANA LETTER KI'],
    ['\u30AE', '\u0192M', 'KATAKANA LETTER GI'],
    ['\u30AF', '\u0192N', 'KATAKANA LETTER KU'],
    ['\u30B0', '\u0192O', 'KATAKANA LETTER GU'],
    ['\u30B1', '\u0192P', 'KATAKANA LETTER KE'],
    ['\u30B2', '\u0192Q', 'KATAKANA LETTER GE'],
    ['\u30B3', '\u0192R', 'KATAKANA LETTER KO'],
    ['\u30B4', '\u0192S', 'KATAKANA LETTER GO'],
    ['\u30B5', '\u0192T', 'KATAKANA LETTER SA'],
    ['\u30B6', '\u0192U', 'KATAKANA LETTER ZA'],
    ['\u30B7', '\u0192V', 'KATAKANA LETTER SI'],
    ['\u30B8', '\u0192W', 'KATAKANA LETTER ZI'],
    ['\u30B9', '\u0192X', 'KATAKANA LETTER SU'],
    ['\u30BA', '\u0192Y', 'KATAKANA LETTER ZU'],
    ['\u30BB', '\u0192Z', 'KATAKANA LETTER SE'],
    ['\u30BC', '\u0192[', 'KATAKANA LETTER ZE'],
    ['\u30BD', '\u0192\\', 'KATAKANA LETTER SO'],
    ['\u30BE', '\u0192]', 'KATAKANA LETTER ZO'],
    ['\u30BF', '\u0192^', 'KATAKANA LETTER TA'],
    ['\u30C0', '\u0192_', 'KATAKANA LETTER DA'],
    ['\u30C1', '\u0192`', 'KATAKANA LETTER TI'],
    ['\u30C2', '\u0192a', 'KATAKANA LETTER DI'],
    ['\u30C3', '\u0192b', 'KATAKANA LETTER SMALL TU'],
    ['\u30C4', '\u0192c', 'KATAKANA LETTER TU'],
    ['\u30C5', '\u0192d', 'KATAKANA LETTER DU'],
    ['\u30C6', '\u0192e', 'KATAKANA LETTER TE'],
    ['\u30C7', '\u0192f', 'KATAKANA LETTER DE'],
    ['\u30C8', '\u0192g', 'KATAKANA LETTER TO'],
    ['\u30C9', '\u0192h', 'KATAKANA LETTER DO'],
    ['\u30CA', '\u0192i', 'KATAKANA LETTER NA'],
    ['\u30CB', '\u0192j', 'KATAKANA LETTER NI'],
    ['\u30CC', '\u0192k', 'KATAKANA LETTER NU'],
    ['\u30CD', '\u0192l', 'KATAKANA LETTER NE'],
    ['\u30CE', '\u0192m', 'KATAKANA LETTER NO'],
    ['\u30CF', '\u0192n', 'KATAKANA LETTER HA'],
    ['\u30D0', '\u0192o', 'KATAKANA LETTER BA'],
    ['\u30D1', '\u0192p', 'KATAKANA LETTER PA'],
    ['\u30D2', '\u0192q', 'KATAKANA LETTER HI'],
    ['\u30D3', '\u0192r', 'KATAKANA LETTER BI'],
    ['\u30D4', '\u0192s', 'KATAKANA LETTER PI'],
    ['\u30D5', '\u0192t', 'KATAKANA LETTER HU'],
    ['\u30D6', '\u0192u', 'KATAKANA LETTER BU'],
    ['\u30D7', '\u0192v', 'KATAKANA LETTER PU'],
    ['\u30D8', '\u0192w', 'KATAKANA LETTER HE'],
    ['\u30D9', '\u0192x', 'KATAKANA LETTER BE'],
    ['\u30DA', '\u0192y', 'KATAKANA LETTER PE'],
    ['\u30DB', '\u0192z', 'KATAKANA LETTER HO'],
    ['\u30DC', '\u0192{', 'KATAKANA LETTER BO'],
    ['\u30DD', '\u0192|', 'KATAKANA LETTER PO'],
    ['\u30DE', '\u0192}', 'KATAKANA LETTER MA'],
    ['\u30DF', '\u0192~', 'KATAKANA LETTER MI'],
    ['\u30E0', '\u0192\u20AC', 'KATAKANA LETTER MU'],
    ['\u30E1', '\u0192\u0081', 'KATAKANA LETTER ME'],
    ['\u30E2', '\u0192\u201A', 'KATAKANA LETTER MO'],
    ['\u30E3', '\u0192\u0192', 'KATAKANA LETTER SMALL YA'],
    ['\u30E4', '\u0192\u201E', 'KATAKANA LETTER YA'],
    ['\u30E5', '\u0192\u2026', 'KATAKANA LETTER SMALL YU'],
    ['\u30E6', '\u0192\u2020', 'KATAKANA LETTER YU'],
    ['\u30E7', '\u0192\u2021', 'KATAKANA LETTER SMALL YO'],
    ['\u30E8', '\u0192\u02C6', 'KATAKANA LETTER YO'],
    ['\u30E9', '\u0192\u2030', 'KATAKANA LETTER RA'],
    ['\u30EA', '\u0192\u0160', 'KATAKANA LETTER RI'],
    ['\u30EB', '\u0192\u2039', 'KATAKANA LETTER RU'],
    ['\u30EC', '\u0192\u0152', 'KATAKANA LETTER RE'],
    ['\u30ED', '\u0192\u008D', 'KATAKANA LETTER RO'],
    ['\u30EE', '\u0192\u017D', 'KATAKANA LETTER SMALL WA'],
    ['\u30EF', '\u0192\u008F', 'KATAKANA LETTER WA'],
    ['\u30F0', '\u0192\u0090', 'KATAKANA LETTER WI'],
    ['\u30F1', '\u0192\u2018', 'KATAKANA LETTER WE'],
    ['\u30F2', '\u0192\u2019', 'KATAKANA LETTER WO'],
    ['\u30F3', '\u0192\u201C', 'KATAKANA LETTER N'],
    ['\u30F4', '\u0192\u201D', 'KATAKANA LETTER VU'],
    ['\u30F5', '\u0192\u2022', 'KATAKANA LETTER SMALL KA'],
    ['\u30F6', '\u0192\u2013', 'KATAKANA LETTER SMALL KE'],
    ['\u30FB', '\u0081E', 'KATAKANA MIDDLE DOT'],
    ['\u30FC', '\u0081[', 'KATAKANA-HIRAGANA PROLONGED SOUND MARK'],
    ['\u30FD', '\u0081R', 'KATAKANA ITERATION MARK'],
    ['\u30FE', '\u0081S', 'KATAKANA VOICED ITERATION MARK'],

    ['\uFF66', '\u00A6', 'HALFWIDTH KATAKANA LETTER WO'],
    ['\uFF67', '\u00A7', 'HALFWIDTH KATAKANA LETTER SMALL A'],
    ['\uFF68', '\u00A8', 'HALFWIDTH KATAKANA LETTER SMALL I'],
    ['\uFF69', '\u00A9', 'HALFWIDTH KATAKANA LETTER SMALL U'],
    ['\uFF6A', '\u00AA', 'HALFWIDTH KATAKANA LETTER SMALL E'],
    ['\uFF6B', '\u00AB', 'HALFWIDTH KATAKANA LETTER SMALL O'],
    ['\uFF6C', '\u00AC', 'HALFWIDTH KATAKANA LETTER SMALL YA'],
    ['\uFF6D', '\u00AD', 'HALFWIDTH KATAKANA LETTER SMALL YU'],
    ['\uFF6E', '\u00AE', 'HALFWIDTH KATAKANA LETTER SMALL YO'],
    ['\uFF6F', '\u00AF', 'HALFWIDTH KATAKANA LETTER SMALL TU'],
    ['\uFF70', '\u00B0', 'HALFWIDTH KATAKANA-HIRAGANA PROLONGED SOUND MARK'],
    ['\uFF71', '\u00B1', 'HALFWIDTH KATAKANA LETTER A'],
    ['\uFF72', '\u00B2', 'HALFWIDTH KATAKANA LETTER I'],
    ['\uFF73', '\u00B3', 'HALFWIDTH KATAKANA LETTER U'],
    ['\uFF74', '\u00B4', 'HALFWIDTH KATAKANA LETTER E'],
    ['\uFF75', '\u00B5', 'HALFWIDTH KATAKANA LETTER O'],
    ['\uFF76', '\u00B6', 'HALFWIDTH KATAKANA LETTER KA'],
    ['\uFF77', '\u00B7', 'HALFWIDTH KATAKANA LETTER KI'],
    ['\uFF78', '\u00B8', 'HALFWIDTH KATAKANA LETTER KU'],
    ['\uFF79', '\u00B9', 'HALFWIDTH KATAKANA LETTER KE'],
    ['\uFF7A', '\u00BA', 'HALFWIDTH KATAKANA LETTER KO'],
    ['\uFF7B', '\u00BB', 'HALFWIDTH KATAKANA LETTER SA'],
    ['\uFF7C', '\u00BC', 'HALFWIDTH KATAKANA LETTER SI'],
    ['\uFF7D', '\u00BD', 'HALFWIDTH KATAKANA LETTER SU'],
    ['\uFF7E', '\u00BE', 'HALFWIDTH KATAKANA LETTER SE'],
    ['\uFF7F', '\u00BF', 'HALFWIDTH KATAKANA LETTER SO'],
    ['\uFF80', '\u00C0', 'HALFWIDTH KATAKANA LETTER TA'],
    ['\uFF81', '\u00C1', 'HALFWIDTH KATAKANA LETTER TI'],
    ['\uFF82', '\u00C2', 'HALFWIDTH KATAKANA LETTER TU'],
    ['\uFF83', '\u00C3', 'HALFWIDTH KATAKANA LETTER TE'],
    ['\uFF84', '\u00C4', 'HALFWIDTH KATAKANA LETTER TO'],
    ['\uFF85', '\u00C5', 'HALFWIDTH KATAKANA LETTER NA'],
    ['\uFF86', '\u00C6', 'HALFWIDTH KATAKANA LETTER NI'],
    ['\uFF87', '\u00C7', 'HALFWIDTH KATAKANA LETTER NU'],
    ['\uFF88', '\u00C8', 'HALFWIDTH KATAKANA LETTER NE'],
    ['\uFF89', '\u00C9', 'HALFWIDTH KATAKANA LETTER NO'],
    ['\uFF8A', '\u00CA', 'HALFWIDTH KATAKANA LETTER HA'],
    ['\uFF8B', '\u00CB', 'HALFWIDTH KATAKANA LETTER HI'],
    ['\uFF8C', '\u00CC', 'HALFWIDTH KATAKANA LETTER HU'],
    ['\uFF8D', '\u00CD', 'HALFWIDTH KATAKANA LETTER HE'],
    ['\uFF8E', '\u00CE', 'HALFWIDTH KATAKANA LETTER HO'],
    ['\uFF8F', '\u00CF', 'HALFWIDTH KATAKANA LETTER MA'],
    ['\uFF90', '\u00D0', 'HALFWIDTH KATAKANA LETTER MI'],
    ['\uFF91', '\u00D1', 'HALFWIDTH KATAKANA LETTER MU'],
    ['\uFF92', '\u00D2', 'HALFWIDTH KATAKANA LETTER ME'],
    ['\uFF93', '\u00D3', 'HALFWIDTH KATAKANA LETTER MO'],
    ['\uFF94', '\u00D4', 'HALFWIDTH KATAKANA LETTER YA'],
    ['\uFF95', '\u00D5', 'HALFWIDTH KATAKANA LETTER YU'],
    ['\uFF96', '\u00D6', 'HALFWIDTH KATAKANA LETTER YO'],
    ['\uFF97', '\u00D7', 'HALFWIDTH KATAKANA LETTER RA'],
    ['\uFF98', '\u00D8', 'HALFWIDTH KATAKANA LETTER RI'],
    ['\uFF99', '\u00D9', 'HALFWIDTH KATAKANA LETTER RU'],
    ['\uFF9A', '\u00DA', 'HALFWIDTH KATAKANA LETTER RE'],
    ['\uFF9B', '\u00DB', 'HALFWIDTH KATAKANA LETTER RO'],
    ['\uFF9C', '\u00DC', 'HALFWIDTH KATAKANA LETTER WA'],
    ['\uFF9D', '\u00DD', 'HALFWIDTH KATAKANA LETTER N'],
    ['\uFF9E', '\u00DE', 'HALFWIDTH KATAKANA VOICED SOUND MARK'],
    ['\uFF9F', '\u00DF', 'HALFWIDTH KATAKANA SEMI-VOICED SOUND MARK'],

    ['\uFFE5', '\u0081\u008F', 'FULLWIDTH YEN SIGN'],
    ['\uFFE3', '\u0081P', 'FULLWIDTH MACRON'],

    ['\u3000', '\u0081@', 'IDEOGRAPHIC SPACE'],
    ['\u3001', '\u0081A', 'IDEOGRAPHIC COMMA'],
    ['\u3002', '\u0081B', 'IDEOGRAPHIC FULL STOP'],
    ['\u3003', '\u0081V', 'DITTO MARK'],
    ['\u3005', '\u0081X', 'IDEOGRAPHIC ITERATION MARK'],
    ['\u3006', '\u0081Y', 'IDEOGRAPHIC CLOSING MARK'],
    ['\u3007', '\u0081Z', 'IDEOGRAPHIC NUMBER ZERO'],
    ['\u3008', '\u0081q', 'LEFT ANGLE BRACKET'],
    ['\u3009', '\u0081r', 'RIGHT ANGLE BRACKET'],
    ['\u300A', '\u0081s', 'LEFT DOUBLE ANGLE BRACKET'],
    ['\u300B', '\u0081t', 'RIGHT DOUBLE ANGLE BRACKET'],
    ['\u300C', '\u0081u', 'LEFT CORNER BRACKET'],
    ['\u300D', '\u0081v', 'RIGHT CORNER BRACKET'],
    ['\u300E', '\u0081w', 'LEFT WHITE CORNER BRACKET'],
    ['\u300F', '\u0081x', 'RIGHT WHITE CORNER BRACKET'],
    ['\u3010', '\u0081y', 'LEFT BLACK LENTICULAR BRACKET'],
    ['\u3011', '\u0081z', 'RIGHT BLACK LENTICULAR BRACKET'],
    ['\u3012', '\u0081\u00A7', 'POSTAL MARK'],
    ['\u3013', '\u0081\u00AC', 'GETA MARK'],
    ['\u3014', '\u0081k', 'LEFT TORTOISE SHELL BRACKET'],
    ['\u3015', '\u0081l', 'RIGHT TORTOISE SHELL BRACKET'],

    ['\uFF01', '\u0081I', 'FULLWIDTH EXCLAMATION MARK'],
    ['\uFF03', '\u0081\u201D', 'FULLWIDTH NUMBER SIGN'],
    ['\uFF04', '\u0081\u0090', 'FULLWIDTH DOLLAR SIGN'],
    ['\uFF05', '\u0081\u201C', 'FULLWIDTH PERCENT SIGN'],
    ['\uFF06', '\u0081\u2022', 'FULLWIDTH AMPERSAND'],
    ['\uFF08', '\u0081i', 'FULLWIDTH LEFT PARENTHESIS'],
    ['\uFF09', '\u0081j', 'FULLWIDTH RIGHT PARENTHESIS'],
    ['\uFF0A', '\u0081\u2013', 'FULLWIDTH ASTERISK'],
    ['\uFF0B', '\u0081{', 'FULLWIDTH PLUS SIGN'],
    ['\uFF0C', '\u0081C', 'FULLWIDTH COMMA'],
    ['\uFF0E', '\u0081D', 'FULLWIDTH FULL STOP'],
    ['\uFF0F', '\u0081^', 'FULLWIDTH SOLIDUS'],

    ['\uFF10', '\u201AO', 'FULLWIDTH DIGIT ZERO'],
    ['\uFF11', '\u201AP', 'FULLWIDTH DIGIT ONE'],
    ['\uFF12', '\u201AQ', 'FULLWIDTH DIGIT TWO'],
    ['\uFF13', '\u201AR', 'FULLWIDTH DIGIT THREE'],
    ['\uFF14', '\u201AS', 'FULLWIDTH DIGIT FOUR'],
    ['\uFF15', '\u201AT', 'FULLWIDTH DIGIT FIVE'],
    ['\uFF16', '\u201AU', 'FULLWIDTH DIGIT SIX'],
    ['\uFF17', '\u201AV', 'FULLWIDTH DIGIT SEVEN'],
    ['\uFF18', '\u201AW', 'FULLWIDTH DIGIT EIGHT'],
    ['\uFF19', '\u201AX', 'FULLWIDTH DIGIT NINE'],

    ['\uFF1A', '\u0081F', 'FULLWIDTH COLON'],
    ['\uFF1B', '\u0081G', 'FULLWIDTH SEMICOLON'],
    ['\uFF1C', '\u0081\u0192', 'FULLWIDTH LESS-THAN SIGN'],
    ['\uFF1D', '\u0081\u0081', 'FULLWIDTH EQUALS SIGN'],
    ['\uFF1E', '\u0081\u201E', 'FULLWIDTH GREATER-THAN SIGN'],
    ['\uFF1F', '\u0081H', 'FULLWIDTH QUESTION MARK'],
    ['\uFF20', '\u0081\u2014', 'FULLWIDTH COMMERCIAL AT'],

    ['\uFF21', '\u201A`', 'FULLWIDTH LATIN CAPITAL LETTER A'],
    ['\uFF22', '\u201Aa', 'FULLWIDTH LATIN CAPITAL LETTER B'],
    ['\uFF23', '\u201Ab', 'FULLWIDTH LATIN CAPITAL LETTER C'],
    ['\uFF24', '\u201Ac', 'FULLWIDTH LATIN CAPITAL LETTER D'],
    ['\uFF25', '\u201Ad', 'FULLWIDTH LATIN CAPITAL LETTER E'],
    ['\uFF26', '\u201Ae', 'FULLWIDTH LATIN CAPITAL LETTER F'],
    ['\uFF27', '\u201Af', 'FULLWIDTH LATIN CAPITAL LETTER G'],
    ['\uFF28', '\u201Ag', 'FULLWIDTH LATIN CAPITAL LETTER H'],
    ['\uFF29', '\u201Ah', 'FULLWIDTH LATIN CAPITAL LETTER I'],
    ['\uFF2A', '\u201Ai', 'FULLWIDTH LATIN CAPITAL LETTER J'],
    ['\uFF2B', '\u201Aj', 'FULLWIDTH LATIN CAPITAL LETTER K'],
    ['\uFF2C', '\u201Ak', 'FULLWIDTH LATIN CAPITAL LETTER L'],
    ['\uFF2D', '\u201Al', 'FULLWIDTH LATIN CAPITAL LETTER M'],
    ['\uFF2E', '\u201Am', 'FULLWIDTH LATIN CAPITAL LETTER N'],
    ['\uFF2F', '\u201An', 'FULLWIDTH LATIN CAPITAL LETTER O'],
    ['\uFF30', '\u201Ao', 'FULLWIDTH LATIN CAPITAL LETTER P'],
    ['\uFF31', '\u201Ap', 'FULLWIDTH LATIN CAPITAL LETTER Q'],
    ['\uFF32', '\u201Aq', 'FULLWIDTH LATIN CAPITAL LETTER R'],
    ['\uFF33', '\u201Ar', 'FULLWIDTH LATIN CAPITAL LETTER S'],
    ['\uFF34', '\u201As', 'FULLWIDTH LATIN CAPITAL LETTER T'],
    ['\uFF35', '\u201At', 'FULLWIDTH LATIN CAPITAL LETTER U'],
    ['\uFF36', '\u201Au', 'FULLWIDTH LATIN CAPITAL LETTER V'],
    ['\uFF37', '\u201Av', 'FULLWIDTH LATIN CAPITAL LETTER W'],
    ['\uFF38', '\u201Aw', 'FULLWIDTH LATIN CAPITAL LETTER X'],
    ['\uFF39', '\u201Ax', 'FULLWIDTH LATIN CAPITAL LETTER Y'],
    ['\uFF3A', '\u201Ay', 'FULLWIDTH LATIN CAPITAL LETTER Z'],

    ['\uFF3B', '\u0081m', 'FULLWIDTH LEFT SQUARE BRACKET'],
    ['\uFF3C', '\u0081_', 'FULLWIDTH REVERSE SOLIDUS'],
    ['\uFF3D', '\u0081n', 'FULLWIDTH RIGHT SQUARE BRACKET'],
    ['\uFF3E', '\u0081O', 'FULLWIDTH CIRCUMFLEX ACCENT'],
    ['\uFF3F', '\u0081Q', 'FULLWIDTH LOW LINE'],
    ['\uFF40', '\u0081M', 'FULLWIDTH GRAVE ACCENT'],

    ['\uFF41', '\u201A\u0081', 'FULLWIDTH LATIN SMALL LETTER A'],
    ['\uFF42', '\u201A\u201A', 'FULLWIDTH LATIN SMALL LETTER B'],
    ['\uFF43', '\u201A\u0192', 'FULLWIDTH LATIN SMALL LETTER C'],
    ['\uFF44', '\u201A\u201E', 'FULLWIDTH LATIN SMALL LETTER D'],
    ['\uFF45', '\u201A\u2026', 'FULLWIDTH LATIN SMALL LETTER E'],
    ['\uFF46', '\u201A\u2020', 'FULLWIDTH LATIN SMALL LETTER F'],
    ['\uFF47', '\u201A\u2021', 'FULLWIDTH LATIN SMALL LETTER G'],
    ['\uFF48', '\u201A\u02C6', 'FULLWIDTH LATIN SMALL LETTER H'],
    ['\uFF49', '\u201A\u2030', 'FULLWIDTH LATIN SMALL LETTER I'],
    ['\uFF4A', '\u201A\u0160', 'FULLWIDTH LATIN SMALL LETTER J'],
    ['\uFF4B', '\u201A\u2039', 'FULLWIDTH LATIN SMALL LETTER K'],
    ['\uFF4C', '\u201A\u0152', 'FULLWIDTH LATIN SMALL LETTER L'],
    ['\uFF4D', '\u201A\u008D', 'FULLWIDTH LATIN SMALL LETTER M'],
    ['\uFF4E', '\u201A\u017D', 'FULLWIDTH LATIN SMALL LETTER N'],
    ['\uFF4F', '\u201A\u008F', 'FULLWIDTH LATIN SMALL LETTER O'],
    ['\uFF50', '\u201A\u0090', 'FULLWIDTH LATIN SMALL LETTER P'],
    ['\uFF51', '\u201A\u2018', 'FULLWIDTH LATIN SMALL LETTER Q'],
    ['\uFF52', '\u201A\u2019', 'FULLWIDTH LATIN SMALL LETTER R'],
    ['\uFF53', '\u201A\u201C', 'FULLWIDTH LATIN SMALL LETTER S'],
    ['\uFF54', '\u201A\u201D', 'FULLWIDTH LATIN SMALL LETTER T'],
    ['\uFF55', '\u201A\u2022', 'FULLWIDTH LATIN SMALL LETTER U'],
    ['\uFF56', '\u201A\u2013', 'FULLWIDTH LATIN SMALL LETTER V'],
    ['\uFF57', '\u201A\u2014', 'FULLWIDTH LATIN SMALL LETTER W'],
    ['\uFF58', '\u201A\u02DC', 'FULLWIDTH LATIN SMALL LETTER X'],
    ['\uFF59', '\u201A\u2122', 'FULLWIDTH LATIN SMALL LETTER Y'],
    ['\uFF5A', '\u201A\u0161', 'FULLWIDTH LATIN SMALL LETTER Z'],

    ['\uFF5B', '\u0081o', 'FULLWIDTH LEFT CURLY BRACKET'],
    ['\uFF5C', '\u0081b', 'FULLWIDTH VERTICAL LINE'],
    ['\uFF5D', '\u0081p', 'FULLWIDTH RIGHT CURLY BRACKET'],

    ['\uFF61', '\u00A1', 'HALFWIDTH IDEOGRAPHIC FULL STOP'],
    ['\uFF62', '\u00A2', 'HALFWIDTH LEFT CORNER BRACKET'],
    ['\uFF63', '\u00A3', 'HALFWIDTH RIGHT CORNER BRACKET'],
    ['\uFF64', '\u00A4', 'HALFWIDTH IDEOGRAPHIC COMMA'],
    ['\uFF65', '\u00A5', 'HALFWIDTH KATAKANA MIDDLE DOT'],
];

export const SYMBOL_ENTRIES: SymbolEntry[] = characterMapping.map(([unicodeChar, encodedStr, desc]) => ({
  encodedStr,
  unicodeChar,
  desc,
  category: getCategory(desc)
}))

const SMP_TO_UNICODE = new Map<string, string>()
const UNICODE_TO_SMP = new Map<string, string>()
for (const [unicodeChar, encodedStr] of characterMapping) {
  if (!SMP_TO_UNICODE.has(encodedStr)) SMP_TO_UNICODE.set(encodedStr, unicodeChar)
  if (!UNICODE_TO_SMP.has(unicodeChar)) UNICODE_TO_SMP.set(unicodeChar, encodedStr)
}
for (const [unicodeChar, encodedStr] of CJK_MAPPING) {
  if (!SMP_TO_UNICODE.has(encodedStr)) SMP_TO_UNICODE.set(encodedStr, unicodeChar)
  if (!UNICODE_TO_SMP.has(unicodeChar)) UNICODE_TO_SMP.set(unicodeChar, encodedStr)
}

export function smpToUnicode(text: string): string {
  if (!text) return ''
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (i + 1 < text.length) {
      const hit2 = SMP_TO_UNICODE.get(text.slice(i, i + 2))
      if (hit2 !== undefined) {
        out += hit2
        i++
        continue
      }
    }
    out += SMP_TO_UNICODE.get(text[i]) ?? text[i]
  }
  return out
}

export function unicodeToSmp(text: string): string {
  if (!text) return ''
  let out = ''
  for (const ch of text) {
    out += UNICODE_TO_SMP.get(ch) ?? ch
  }
  return out
}

export interface SmpTextOptions {
  fontSize?: number
  fontFamily?: string
  secondaryFontFamily?: string
  symbolFontFamily?: string
  secondaryFontSize?: number
  secondaryFontWeight?: number | string
  secondaryFontStyle?: string
  color?: string
  fontWeight?: number | string
  fontStyle?: string
}

export type SmpTextScript = 'normal' | 'sub' | 'sup'

export interface SmpTextStyle {
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  fontSize: number
  color: string
  script: SmpTextScript
  xOffset: number
  yOffset: number
}

export interface SmpTextRun {
  text: string
  style: SmpTextStyle
}

export interface SmpTextLine {
  runs: SmpTextRun[]
}

interface SmpTextState {
  base: SmpTextStyle
  secondaryFontFamily: string
  symbolFontFamily: string
  secondaryFontSize: number
  secondaryFontWeight: number
  secondaryFontStyle: 'normal' | 'italic'
  italic: boolean
  bold: boolean
  script: SmpTextScript
  fontMode: 'base' | 'greek' | 'latin'
  xOffset: number
  yOffset: number
  sizeScale: number
  color: string | null
}

const DEFAULT_TEXT_FONT_SIZE = 16
const DEFAULT_TEXT_FONT_FAMILY = 'Times New Roman, serif'
const DEFAULT_TEXT_COLOR = '#000000'

const SYMBOL_GREEK: Record<string, string> = {
  A: 'Α',
  B: 'Β',
  C: 'Χ',
  D: 'Δ',
  E: 'Ε',
  F: 'Φ',
  G: 'Γ',
  H: 'Η',
  I: 'Ι',
  J: 'ϑ',
  K: 'Κ',
  L: 'Λ',
  M: 'Μ',
  N: 'Ν',
  O: 'Ο',
  P: 'Π',
  Q: 'Θ',
  R: 'Ρ',
  S: 'Σ',
  T: 'Τ',
  U: 'Υ',
  V: 'ς',
  W: 'Ω',
  X: 'Ξ',
  Y: 'Ψ',
  Z: 'Ζ',
  a: 'α',
  b: 'β',
  c: 'χ',
  d: 'δ',
  e: 'ε',
  f: 'φ',
  g: 'γ',
  h: 'η',
  i: 'ι',
  j: 'φ',
  k: 'κ',
  l: 'λ',
  m: 'μ',
  n: 'ν',
  o: 'ο',
  p: 'π',
  q: 'θ',
  r: 'ρ',
  s: 'σ',
  t: 'τ',
  u: 'υ',
  v: 'ϖ',
  w: 'ω',
  x: 'ξ',
  y: 'ψ',
  z: 'ζ',
}

const WINDOWS_1252_TEXT: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
}

const SYMBOL_CODE: Record<number, string> = {
  0x2d: '−',
  0x3c: '≤',
  0x3d: '≡',
  0x3e: '≥',
  0x47: 'Γ',
  0x48: 'Η',
  0x4d: 'Μ',
  0x4e: 'Ν',
  0x53: 'Σ',
  0x57: 'Ω',
  0x58: 'Ξ',
  0x59: 'Ψ',
  0x5e: '⊥',
  0x5f: '∧',
  0x71: 'θ',
  0x72: 'ρ',
  0x73: 'σ',
  0x77: 'ω',
  0x78: 'χ',
  0x79: 'ψ',
  0xb9: '∴',
  0xd7: '×',
  0xf7: '÷',
}

function normalizeTextWeight(value: number | string | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (lower === 'bold') return 700
    const parsed = Number(lower)
    if (Number.isFinite(parsed)) return parsed
  }
  return 400
}

function normalizeTextStyle(value: string | undefined): 'normal' | 'italic' {
  const lower = (value || '').toLowerCase()
  return lower.includes('italic') || lower.includes('oblique') ? 'italic' : 'normal'
}

function joinFontFamilies(...families: Array<string | undefined>): string {
  const result: string[] = []
  const seen = new Set<string>()
  for (const family of families) {
    const value = (family || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result.length > 0 ? result.join(', ') : DEFAULT_TEXT_FONT_FAMILY
}

function isGlyphChar(char: string): boolean {
  const code = char.codePointAt(0) || 0
  return (
    (code >= 0x3000 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef)
  )
}

function createTextState(options: SmpTextOptions): SmpTextState {
  const fontSize =
    typeof options.fontSize === 'number' && Number.isFinite(options.fontSize) && options.fontSize > 0
      ? options.fontSize
      : DEFAULT_TEXT_FONT_SIZE
  const fontFamily = options.fontFamily?.trim() || DEFAULT_TEXT_FONT_FAMILY
  const secondaryFontSize =
    typeof options.secondaryFontSize === 'number' &&
    Number.isFinite(options.secondaryFontSize) &&
    options.secondaryFontSize > 0
      ? options.secondaryFontSize
      : fontSize
  return {
    base: {
      fontFamily,
      fontWeight: normalizeTextWeight(options.fontWeight),
      fontStyle: normalizeTextStyle(options.fontStyle),
      fontSize,
      color: options.color || DEFAULT_TEXT_COLOR,
      script: 'normal',
      xOffset: 0,
      yOffset: 0,
    },
    secondaryFontFamily: options.secondaryFontFamily?.trim() || '',
    symbolFontFamily: options.symbolFontFamily?.trim() || '',
    secondaryFontSize,
    secondaryFontWeight: normalizeTextWeight(options.secondaryFontWeight ?? options.fontWeight),
    secondaryFontStyle: normalizeTextStyle(options.secondaryFontStyle ?? options.fontStyle),
    italic: false,
    bold: false,
    script: 'normal',
    fontMode: 'base',
    xOffset: 0,
    yOffset: 0,
    sizeScale: 1,
    color: null,
  }
}

function resetTextState(state: SmpTextState): void {
  state.italic = false
  state.bold = false
  state.script = 'normal'
  state.fontMode = 'base'
  state.sizeScale = 1
}

// Sub/superscript runs are rendered at this fraction of the base size, and the value is baked
// into SmpTextStyle.fontSize. Width measurement must not scale it a second time.
const SCRIPT_SIZE_RATIO = 0.72

function getTextStyle(state: SmpTextState, char: string): SmpTextStyle {
  let fontFamily = state.base.fontFamily
  let fontSize = state.base.fontSize
  let fontWeight = state.base.fontWeight
  let fontStyle = state.base.fontStyle
  if (state.fontMode === 'greek') {
    fontFamily = joinFontFamilies(state.symbolFontFamily, state.secondaryFontFamily, state.base.fontFamily)
    fontSize = state.secondaryFontSize
    fontWeight = state.secondaryFontWeight
    fontStyle = state.secondaryFontStyle
  }
  if (isGlyphChar(char)) {
    fontFamily = joinFontFamilies(state.secondaryFontFamily, fontFamily, state.base.fontFamily)
    fontSize = state.secondaryFontSize
    fontWeight = state.secondaryFontWeight
    fontStyle = state.secondaryFontStyle
  }
  const scriptScale = state.script === 'normal' ? 1 : SCRIPT_SIZE_RATIO
  return {
    fontFamily,
    fontWeight: state.bold ? 700 : fontWeight,
    fontStyle: state.italic ? 'italic' : fontStyle,
    fontSize: Math.max(1, fontSize * state.sizeScale * scriptScale),
    color: state.color || state.base.color,
    script: state.script,
    xOffset: state.xOffset,
    yOffset: state.yOffset,
  }
}

function sameTextStyle(a: SmpTextStyle, b: SmpTextStyle): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.script === b.script &&
    a.xOffset === b.xOffset &&
    a.yOffset === b.yOffset
  )
}

function decodeCharacterCode(code: number, symbolMode: boolean): string {
  const symbolChar = SYMBOL_CODE[code]
  if (symbolMode && symbolChar) return symbolChar
  if (WINDOWS_1252_TEXT[code]) return WINDOWS_1252_TEXT[code]
  if (code >= 0 && code <= 0x10ffff) return String.fromCodePoint(code)
  return ''
}

function appendText(lines: SmpTextLine[], state: SmpTextState, value: string, decodeSymbol = true): void {
  if (!value) return
  const decoded = decodeSymbol && state.fontMode === 'greek' ? Array.from(value).map((char) => SYMBOL_GREEK[char] || char).join('') : value
  for (const char of Array.from(decoded)) {
    const line = lines[lines.length - 1]
    const style = getTextStyle(state, char)
    const previous = line.runs[line.runs.length - 1]
    if (previous && sameTextStyle(previous.style, style)) {
      previous.text += char
    } else {
      line.runs.push({ text: char, style })
    }
  }
}

function readDecimal(text: string, start: number, maxDigits: number): { value: number; end: number } | null {
  let index = start
  while (index < text.length && index - start < maxDigits && text[index] >= '0' && text[index] <= '9') index++
  if (index === start) return null
  const value = Number(text.slice(start, index))
  return Number.isFinite(value) ? { value, end: index } : null
}

function readSignedNumber(text: string, start: number): { value: number; end: number } | null {
  let index = start
  while (index < text.length && /\s/.test(text[index])) index++
  let sign = 1
  if (text[index] === '+' || text[index] === '-') {
    if (text[index] === '-') sign = -1
    index++
  }
  const decimal = readDecimal(text, index, 8)
  if (!decimal) return null
  let value = sign * decimal.value
  if (text[decimal.end] === '.' || text[decimal.end] === ',') {
    const fractionStart = decimal.end + 1
    const fraction = readDecimal(text, fractionStart, 8)
    if (fraction) {
      value += sign * fraction.value / 10 ** (fraction.end - fractionStart)
      return { value, end: fraction.end }
    }
  }
  return { value, end: decimal.end }
}

function pushTextLine(lines: SmpTextLine[]): void {
  lines.push({ runs: [] })
}

export function tokenizeSmpText(rawText: string, options: SmpTextOptions = {}): SmpTextLine[] {
  const decoded = smpToUnicode(rawText || '')
  const lines: SmpTextLine[] = [{ runs: [] }]
  const state = createTextState(options)
  let index = 0

  while (index < decoded.length) {
    const char = decoded[index]

    if (char === '\\' && decoded[index + 1] === 'n') {
      pushTextLine(lines)
      index += 2
      continue
    }
    if (char === '\r') {
      pushTextLine(lines)
      index += decoded[index + 1] === '\n' ? 2 : 1
      continue
    }
    if (char === '\n') {
      pushTextLine(lines)
      index++
      continue
    }

    if (char === '%' && index + 1 < decoded.length) {
      const control = decoded[index + 1]
      if (control === 'I') {
        state.italic = true
        index += 2
        continue
      }
      if (control === 'B') {
        state.bold = true
        index += 2
        continue
      }
      if (control === 'K') {
        const hex = decoded.slice(index + 2, index + 8)
        if (/^[0-9a-f]{6}$/i.test(hex)) {
          state.color = `#${hex.toLowerCase()}`
          index += 8
          continue
        }
        appendText(lines, state, '%K', false)
        index += 2
        continue
      }
      if (control === 'O') {
        state.bold = true
        state.italic = true
        index += 2
        continue
      }
      if (control === 'R') {
        resetTextState(state)
        index += 2
        continue
      }
      if (control === 'G') {
        state.fontMode = 'greek'
        index += 2
        continue
      }
      if (control === 'A') {
        state.fontMode = 'latin'
        index += 2
        continue
      }
      if (control === 'X' || control === 'Y') {
        const offset = readSignedNumber(decoded, index + 2)
        if (offset) {
          if (control === 'X') state.xOffset = offset.value
          else state.yOffset = offset.value
          index = offset.end
          continue
        }
        appendText(lines, state, `%${control}`, false)
        index += 2
        continue
      }
      if (control === 'Q') {
        const code = readDecimal(decoded, index + 2, 3)
        if (code) {
          appendText(lines, state, decodeCharacterCode(code.value, state.fontMode === 'greek'))
          index = code.end
          continue
        }
        appendText(lines, state, '%Q', false)
        index += 2
        continue
      }
      if (control === 'S') {
        const size = readDecimal(decoded, index + 2, 3)
        if (size && size.value > 0) {
          state.sizeScale = size.value / 100
          index = size.end
          continue
        }
        appendText(lines, state, '%S', false)
        index += 2
        continue
      }
      appendText(lines, state, `%${control}`, false)
      index += 2
      continue
    }

    if (char === '_') {
      state.script = 'sub'
      index++
      continue
    }
    if (char === '^') {
      state.script = 'sup'
      index++
      continue
    }
    if (char === '@') {
      state.script = 'normal'
      index++
      continue
    }

    appendText(lines, state, char)
    index++
  }

  return lines
}

export interface SmpLineMetrics {
  width: number
  indent: number
  fontSize: number
}

export function measureSmpLine(line: SmpTextLine, fontSize: number): SmpLineMetrics {
  const baseSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : DEFAULT_TEXT_FONT_SIZE
  let maxFontSize = baseSize
  let width = 0
  let indent = 0
  line.runs.forEach((run, runIndex) => {
    maxFontSize = Math.max(maxFontSize, run.style.fontSize)
    const charWidth = Array.from(run.text).reduce((sum, char) => sum + (isGlyphChar(char) ? 1 : 0.58), 0)
    width += charWidth * run.style.fontSize
    if (runIndex === 0) indent = run.style.xOffset * run.style.fontSize * 0.01
  })
  return { width, indent, fontSize: maxFontSize }
}

export function measureSmpText(
  lines: SmpTextLine[],
  fontSize: number
): { width: number; height: number; lineHeight: number } {
  const baseSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : DEFAULT_TEXT_FONT_SIZE
  let maxFontSize = baseSize
  let width = 0
  for (const line of lines) {
    let lineWidth = 0
    line.runs.forEach((run, runIndex) => {
      maxFontSize = Math.max(maxFontSize, run.style.fontSize)
      const charWidth = Array.from(run.text).reduce((sum, char) => sum + (isGlyphChar(char) ? 1 : 0.58), 0)
      lineWidth += charWidth * run.style.fontSize
      // xOffset is an absolute per-run value, so only the first run contributes; adding it
      // for every run would count the same shift once per run.
      if (runIndex === 0) lineWidth += run.style.xOffset * run.style.fontSize * 0.01
    })
    width = Math.max(width, lineWidth)
  }
  const lineHeight = maxFontSize * 1.2
  return { width, height: Math.max(lineHeight, lines.length * lineHeight), lineHeight }
}
