/*! English text to Oculus visemes, ported from met4citizen/TalkingHead modules/lipsync-en.mjs (2afe6d79779313db8909badebf46f9805a6c7b70).
MIT License

Copyright (c) 2023-2024 Mika Suominen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const RULE_TEXT: Record<string, string[]> = {
  A: [
    "[A] =aa", " [ARE] =aa RR", " [AR]O=aa RR", "[AR]#=E RR",
    " ^[AS]#=E SS", "[A]WA=aa", "[AW]=aa", " :[ANY]=E nn I",
    "[A]^+#=E", "#:[ALLY]=aa nn I", " [AL]#=aa nn", "[AGAIN]=aa kk E nn",
    "#:[AG]E=I kk", "[A]^+:#=aa", ":[A]^+ =E", "[A]^%=E",
    " [ARR]=aa RR", "[ARR]=aa RR", " :[AR] =aa RR", "[AR] =E",
    "[AR]=aa RR", "[AIR]=E RR", "[AI]=E", "[AY]=E", "[AU]=aa",
    "#:[AL] =aa nn", "#:[ALS] =aa nn SS", "[ALK]=aa kk", "[AL]^=aa nn",
    " :[ABLE]=E PP aa nn", "[ABLE]=aa PP aa nn", "[ANG]+=E nn kk", "[A]=aa"
  ],

  B: [
    " [BE]^#=PP I", "[BEING]=PP I I nn", " [BOTH] =PP O TH",
    " [BUS]#=PP I SS", "[BUIL]=PP I nn", "[B]=PP"
  ],

  C: [
    " [CH]^=kk", "^E[CH]=kk", "[CH]=CH", " S[CI]#=SS aa",
    "[CI]A=SS", "[CI]O=SS", "[CI]EN=SS", "[C]+=SS",
    "[CK]=kk", "[COM]%=kk aa PP", "[C]=kk"
  ],

  D: [
    "#:[DED] =DD I DD", ".E[D] =DD", "#^:E[D] =DD", " [DE]^#=DD I",
    " [DO] =DD U", " [DOES]=DD aa SS", " [DOING]=DD U I nn",
    " [DOW]=DD aa", "[DU]A=kk U", "[D]=DD"
  ],

  E: [
    "#:[E] =", "'^:[E] =", " :[E] =I", "#[ED] =DD", "#:[E]D =",
    "[EV]ER=E FF", "[E]^%=I", "[ERI]#=I RR I", "[ERI]=E RR I",
    "#:[ER]#=E", "[ER]#=E RR", "[ER]=E", " [EVEN]=I FF E nn",
    "#:[E]W=", "@[EW]=U", "[EW]=I U", "[E]O=I", "#:&[ES] =I SS",
    "#:[E]S =", "#:[ELY] =nn I", "#:[EMENT]=PP E nn DD", "[EFUL]=FF U nn",
    "[EE]=I", "[EARN]=E nn", " [EAR]^=E", "[EAD]=E DD", "#:[EA] =I aa",
    "[EA]SU=E", "[EA]=I", "[EIGH]=E", "[EI]=I", " [EYE]=aa", "[EY]=I",
    "[EU]=I U", "[E]=E"
  ],

  F: [
    "[FUL]=FF U nn", "[F]=FF"
  ],

  G: [
    "[GIV]=kk I FF", " [G]I^=kk", "[GE]T=kk E", "SU[GGES]=kk kk E SS",
    "[GG]=kk", " B#[G]=kk", "[G]+=kk", "[GREAT]=kk RR E DD",
    "#[GH]=", "[G]=kk"
  ],

  H: [
    " [HAV]=I aa FF", " [HERE]=I I RR", " [HOUR]=aa EE", "[HOW]=I aa",
    "[H]#=I", "[H]="
  ],

  I: [
    " [IN]=I nn", " [I] =aa", "[IN]D=aa nn", "[IER]=I E",
    "#:R[IED] =I DD", "[IED] =aa DD", "[IEN]=I E nn", "[IE]T=aa E",
    " :[I]%=aa", "[I]%=I", "[IE]=I", "[I]^+:#=I", "[IR]#=aa RR",
    "[IZ]%=aa SS", "[IS]%=aa SS", "[I]D%=aa", "+^[I]^+=I",
    "[I]T%=aa", "#^:[I]^+=I", "[I]^+=aa", "[IR]=E", "[IGH]=aa",
    "[ILD]=aa nn DD", "[IGN] =aa nn", "[IGN]^=aa nn", "[IGN]%=aa nn",
    "[IQUE]=I kk", "[I]=I"
  ],

  J: [
    "[J]=kk"
  ],

  K: [
    " [K]N=", "[K]=kk"
  ],

  L: [
    "[LO]C#=nn O", "L[L]=", "#^:[L]%=aa nn", "[LEAD]=nn I DD", "[L]=nn"
  ],

  M: [
    "[MOV]=PP U FF", "[M]=PP"
  ],

  N: [
    "E[NG]+=nn kk", "[NG]R=nn kk", "[NG]#=nn kk", "[NGL]%=nn kk aa nn",
    "[NG]=nn", "[NK]=nn kk", " [NOW] =nn aa", "[N]=nn"
  ],

  O: [
    "[OF] =aa FF", "[OROUGH]=E O", "#:[OR] =E", "#:[ORS] =E SS",
    "[OR]=aa RR", " [ONE]=FF aa nn", "[OW]=O", " [OVER]=O FF E",
    "[OV]=aa FF", "[O]^%=O", "[O]^EN=O", "[O]^I#=O", "[OL]D=O nn",
    "[OUGHT]=aa DD", "[OUGH]=aa FF", " [OU]=aa", "H[OU]S#=aa",
    "[OUS]=aa SS", "[OUR]=aa RR", "[OULD]=U DD", "^[OU]^L=aa",
    "[OUP]=U OO", "[OU]=aa", "[OY]=O", "[OING]=O I nn", "[OI]=O",
    "[OOR]=aa RR", "[OOK]=U kk", "[OOD]=U DD", "[OO]=U", "[O]E=O",
    "[O] =O", "[OA]=O", " [ONLY]=O nn nn I", " [ONCE]=FF aa nn SS",
    "[ON'T]=O nn DD", "C[O]N=aa", "[O]NG=aa", " ^:[O]N=aa",
    "I[ON]=aa nn", "#:[ON] =aa nn", "#^[ON]=aa nn", "[O]ST =O",
    "[OF]^=aa FF", "[OTHER]=aa TH E", "[OSS] =aa SS", "#^:[OM]=aa PP",
    "[O]=aa"
  ],

  P: [
    "[PH]=FF", "[PEOP]=PP I PP", "[POW]=PP aa", "[PUT] =PP U DD",
    "[P]=PP"
  ],

  Q: [
    "[QUAR]=kk FF aa RR", "[QU]=kk FF", "[Q]=kk"
  ],

  R: [
    " [RE]^#=RR I", "[R]=RR"
  ],

  S: [
    "[SH]=SS", "#[SION]=SS aa nn", "[SOME]=SS aa PP", "#[SUR]#=SS E",
    "[SUR]#=SS E", "#[SU]#=SS U", "#[SSU]#=SS U", "#[SED] =SS DD",
    "#[S]#=SS", "[SAID]=SS E DD", "^[SION]=SS aa nn", "[S]S=",
    ".[S] =SS", "#:.E[S] =SS", "#^:##[S] =SS", "#^:#[S] =SS",
    "U[S] =SS", " :#[S] =SS", " [SCH]=SS kk", "[S]C+=",
    "#[SM]=SS PP", "#[SN]'=SS aa nn", "[S]=SS"
  ],

  T: [
    " [THE] =TH aa", "[TO] =DD U", "[THAT] =TH aa DD", " [THIS] =TH I SS",
    " [THEY]=TH E", " [THERE]=TH E RR", "[THER]=TH E", "[THEIR]=TH E RR",
    " [THAN] =TH aa nn", " [THEM] =TH E PP", "[THESE] =TH I SS",
    " [THEN]=TH E nn", "[THROUGH]=TH RR U", "[THOSE]=TH O SS",
    "[THOUGH] =TH O", " [THUS]=TH aa SS", "[TH]=TH", "#:[TED] =DD I DD",
    "S[TI]#N=CH", "[TI]O=SS", "[TI]A=SS", "[TIEN]=SS aa nn",
    "[TUR]#=CH E", "[TU]A=CH U", " [TWO]=DD U", "[T]=DD"
  ],

  U: [
    " [UN]I=I U nn", " [UN]=aa nn", " [UPON]=aa PP aa nn",
    "@[UR]#=U RR", "[UR]#=I U RR", "[UR]=E", "[U]^ =aa",
    "[U]^^=aa", "[UY]=aa", " G[U]#=", "G[U]%=", "G[U]#=FF",
    "#N[U]=I U", "@[U]=I", "[U]=I U"
  ],

  V: [
    "[VIEW]=FF I U", "[V]=FF"
  ],

  W: [
    " [WERE]=FF E", "[WA]S=FF aa", "[WA]T=FF aa", "[WHERE]=FF E RR",
    "[WHAT]=FF aa DD", "[WHOL]=I O nn", "[WHO]=I U", "[WH]=FF",
    "[WAR]=FF aa RR", "[WOR]^=FF E", "[WR]=RR", "[W]=FF"
  ],

  X: [
    " [X]=SS", "[X]=kk SS"
  ],

  Y: [
    "[YOUNG]=I aa nn", " [YOU]=I U", " [YES]=I E SS", " [Y]=I",
    "#^:[Y] =I", "#^:[Y]I=I", " :[Y] =aa", " :[Y]#=aa",
    " :[Y]^+:#=I", " :[Y]^#=I", "[Y]=I"
  ],

  Z: [
    "[Z]=SS"
  ]
};

const OPS: Record<string, string> = {
  "#": "[AEIOUY]+",
  ".": "[BDVGJLMNRWZ]",
  "%": "(?:ER|E|ES|ED|ING|ELY)",
  "&": "(?:[SCGZXJ]|CH|SH)",
  "@": "(?:[TSRDLZNJ]|TH|CH|SH)",
  "^": "[BCDFGHJKLMNPQRSTVWXZ]",
  "+": "[EIY]",
  ":": "[BCDFGHJKLMNPQRSTVWXZ]*",
  " ": "\\b",
};

interface Rule { regex: RegExp; move: number; visemes: string[] }

const RULES: Record<string, Rule[]> = Object.fromEntries(Object.entries(RULE_TEXT).map(([key, list]) => [key, list.map((rule) => {
  const posL = rule.indexOf("["), posR = rule.indexOf("]"), posE = rule.indexOf("=");
  const letters = [...rule.substring(posL + 1, posR)];
  letters[0] = letters[0].toLowerCase();
  const expression = [...rule.substring(0, posL)].map((x) => OPS[x] ?? x).join("") + letters.join("")
    + [...rule.substring(posR + 1, posE)].map((x) => OPS[x] ?? x).join("");
  const visemes = rule.substring(posE + 1);
  return { regex: new RegExp(expression), move: letters.length, visemes: visemes.length ? visemes.split(" ") : [] };
})]));

export const VISEME_DURATIONS: Record<string, number> = {
  aa: 0.95, E: 0.90, I: 0.92, O: 0.96, U: 0.95, PP: 1.08, SS: 1.23, TH: 1, DD: 1.05, FF: 1.00, kk: 1.21, nn: 0.88, RR: 0.88, sil: 1,
};

const SPECIAL_DURATIONS: Record<string, number> = { " ": 1, ",": 3, "-": 0.5, "'": 0.5 };

const DIGITS = ["oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const DECADES: Record<number, string> = {
  20: "twenties", 30: "thirties", 40: "forties", 50: "fifties", 60: "sixties", 70: "seventies", 80: "eighties", 90: "nineties",
};
const ORDINALS: Record<number, string> = {
  1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
  11: "eleventh", 12: "twelfth", 13: "thirteenth", 14: "fourteenth", 15: "fifteenth", 16: "sixteenth", 17: "seventeeth", 18: "eighteenth",
  19: "nineteenth", 20: "twentieth", 30: "thirtieth", 40: "fortieth", 50: "fiftieth", 60: "sixtieth", 70: "seventieth", 80: "eightieth", 90: "ninetieth",
};
const SYMBOLS: Record<string, string> = { "%": "percent", "€": "euros", "&": "and", "+": "plus", "$": "dollars" };
const SYMBOLS_REG = /[%€&+$]/g;

const digitByDigit = (num: string | number): string => String(num).split("").map((digit) => DIGITS[Number(digit)]).join(" ");

function tens(num: string | number): string {
  const value = Number(num);
  if (value < 10) return (value !== 0 && num.toString().startsWith("0") ? "oh " : "") + ONES[value];
  if (value < 20) return TEENS[value - 10];
  return `${TENS[Math.floor(value / 10)]} ${ONES[value % 10]}`.trim();
}

const setsOfTwo = (num: string | number): string => `${tens(String(num).substring(0, 2))} ${tens(String(num).substring(2, 4))}`;
const hundreds = (num: number): string => (num > 99 ? `${ONES[Math.floor(num / 100)]} hundred ${tens(num % 100)}` : tens(num));
const thousands = (num: number): string => (num >= 1000 ? `${hundreds(Math.floor(num / 1000))} thousand ${hundreds(num % 1000)}` : hundreds(num));
const millions = (num: number): string => (num >= 1000000 ? `${millions(Math.floor(num / 1000000))} million ${thousands(num % 1000000)}` : thousands(num));

export function numberToWords(num: string, isNotSpecial = false): string {
  const n = parseFloat(num), value = Number(num);
  if (num === "0") return "zero";
  if (value < 0) return ` minus ${numberToWords(Math.abs(value).toString(), isNotSpecial).trim()}`;
  if (n && !Number.isInteger(n)) {
    const parts = n.toString().split(".");
    return `${numberToWords(parts[0], isNotSpecial).trim()} point ${digitByDigit(parts[1]).trim()}`;
  }
  if (num.startsWith("0")) return digitByDigit(num).trim();
  if (!isNotSpecial && ((value < 1000 && value > 99 && value % 100 !== 0) || (value > 10000 && value < 1000000))) return digitByDigit(num).trim();
  if (!isNotSpecial && ((value > 1000 && value < 2000) || (value > 2009 && value < 3000))) {
    return value % 100 !== 0 ? setsOfTwo(num).trim() : `${tens(num.substring(0, 2)).trim()} hundred`;
  }
  return millions(value).trim();
}

function decade(text: string): string {
  const num = parseInt(text, 10);
  const isShort = !Number.isNaN(num) && text.length === 2;
  const isLong = !Number.isNaN(num) && text.length > 2 && num > 0 && num <= 3000;
  const thousandsPart = isLong && num % 1000 === 0 ? Math.floor(num / 1000) : null;
  const hundredsPart = isLong && !thousandsPart ? Math.floor(num / 100) : null;
  const tensPart = isShort || isLong ? Math.floor((num % 100) / 10) * 10 : null;
  const words: string[] = [];
  if (thousandsPart) words.push(numberToWords(String(thousandsPart)).trim(), "thousands");
  else {
    if (hundredsPart) words.push(numberToWords(String(hundredsPart)).trim());
    if (tensPart) words.push(DECADES[tensPart] ?? `${numberToWords(String(tensPart)).trim()}s`);
    else if (hundredsPart) words.push("hundreds");
    else words.push(text);
  }
  return words.join(" ");
}

function ordinal(num: number): string {
  if (ORDINALS[num]) return ORDINALS[num];
  const hundredsPart = Math.floor(num / 100), tensPart = Math.floor((num % 100) / 10) * 10, ones = num % 10;
  const words: string[] = [];
  if (hundredsPart) words.push(numberToWords(String(hundredsPart)).trim(), tensPart || ones ? "hundred" : "hundredth");
  if (tensPart) words.push(ones ? numberToWords(String(tensPart)).trim() : ORDINALS[tensPart]);
  if (ones) words.push(ORDINALS[ones]);
  return words.join(" ");
}

export function preProcessText(text: string): string {
  let result = text.replace(/[#_*":;]/g, "").replace(SYMBOLS_REG, (symbol) => ` ${SYMBOLS[symbol]} `);
  if (/\d/.test(result)) {
    result = result.replace(/\b(\d{2,4})['’`]?\s?[sS](?=\s|[.,!?;:]|$)/g, (match, value: string) => {
      const words = decade(value);
      return words === value ? match : words;
    });
    result = result.replace(/\b(\d+)\s*(st|nd|rd|th)(?=\s|[.,!?;:]|$)/gi, (_match, value: string) => ordinal(Number(value)));
    result = result.replace(/\b(\w*?)(\d+)([A-Za-z]+)\b/g, (_match, prefix: string, digits: string, letters: string) => `${prefix}${numberToWords(digits)} ${letters}`)
      .replace(/\b([A-Za-z]+)(\d+)(\w*?)\b/g, (_match, letters: string, digits: string, suffix: string) => `${letters} ${numberToWords(digits)}${suffix}`);
    result = result.replace(/-?(?:\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g, (match, fraction: string | undefined) => {
      const grouped = match.includes(",");
      return numberToWords(grouped ? match.replace(/,/g, "") : match, grouped || Boolean(fraction));
    });
  }
  return result.replace(/(\D)\1\1+/g, "$1$1").replaceAll("  ", " ").normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC").trim();
}

export interface VisemeTrack { words: string; visemes: string[]; times: number[]; durations: number[] }

export function wordsToVisemes(text: string): VisemeTrack {
  const words = text.toUpperCase();
  const track: VisemeTrack = { words, visemes: [], times: [], durations: [] };
  const chars = [...words];
  let time = 0, index = 0;
  while (index < chars.length) {
    const char = chars[index];
    const ruleset = RULES[char];
    if (!ruleset) { index += 1; time += SPECIAL_DURATIONS[char] ?? 0; continue; }
    const test = words.substring(0, index) + char.toLowerCase() + words.substring(index + 1);
    const rule = ruleset.find((candidate) => candidate.regex.test(test));
    if (!rule) { index += 1; continue; }
    for (const viseme of rule.visemes) {
      const last = track.visemes.length - 1;
      if (last >= 0 && track.visemes[last] === viseme) {
        const duration = 0.7 * (VISEME_DURATIONS[viseme] ?? 1);
        track.durations[last] += duration;
        time += duration;
      } else {
        const duration = VISEME_DURATIONS[viseme] ?? 1;
        track.visemes.push(viseme); track.times.push(time); track.durations.push(duration);
        time += duration;
      }
    }
    index += rule.move;
  }
  return track;
}
