import mammoth from 'mammoth';
import JSZip from 'jszip';
import { extractTextItems, getDocumentProxy, inspectPages } from 'unpdf';

const OPTION_LETTER_MAP = {
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  '\u0430': 'A', // Cyrillic а
  '\u0431': 'B', // Cyrillic б
  '\u0432': 'C', // Cyrillic в
  '\u0433': 'D', // Cyrillic г
  '\u0441': 'C', // Cyrillic с (homoglyph)
};

function mapOptionLetter(ch) {
  if (!ch) return null;
  return OPTION_LETTER_MAP[ch.toLowerCase()] || null;
}

const Q_NUM_PREFIX_RE = /^(?:(?:№\s*)?\d+\s*[).:-]|Savol\s*\d+\s*[).:-]?)\s+/i;
const INLINE_OPT_SPLIT_RE =
  /(?<=\S)(?:\s+(?=(?:[*+#]\s*)?(?:[A-Da-d\u0430\u0410\u0431\u0411\u0432\u0412\u0433\u0413\u0441\u0421][)]|\([A-Da-d]\))(?:\s|\S))|\s{2,}(?=(?:[*+#]\s*)?[A-Da-d]\.\s))/g;

const OPTION_LINE_RE =
  /^\s*(?<mark>[#*+])?\s*(?:\((?<pLet>[A-Da-d\u0430\u0410\u0431\u0411\u0432\u0412\u0433\u0413\u0441\u0421])\)|(?<let>[A-Da-d\u0430\u0410\u0431\u0411\u0432\u0412\u0433\u0413\u0441\u0421])\s*(?<sep>[).]))\s*(?<body>.*)$/;

const EXPLANATION_RE = /^(?:Izoh|Tushuntirish|Explanation)\s*[:.-]\s*(.+)$/i;
const ANSWER_HINT_RE = /^(?:To[‘'ʻ`]?g[‘'ʻ`]?ri\s+javob|Javob|Answer)\s*[:.-]\s*([A-Da-d\u0430\u0410\u0431\u0411\u0432\u0412\u0433\u0413\u0441\u0421])\b/i;

function normalizeText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u2007\u202F\t]+/g, ' ')
    .replace(/[\u200B\uFEFF]/g, '');
}

function splitInlineOptions(line) {
  // Split single lines containing multiple options like: "1. Savol? #a) 1  b) 2  c) 3  d) 4"
  const replaced = line.replace(INLINE_OPT_SPLIT_RE, '\n');
  return replaced.split('\n').map((s) => s.trim()).filter(Boolean);
}

function parseOptionMatch(line) {
  const m = OPTION_LINE_RE.exec(line);
  if (!m || !m.groups) return null;
  const rawLetter = m.groups.pLet || m.groups.let;
  const letter = mapOptionLetter(rawLetter);
  if (!letter) return null;

  let body = (m.groups.body || '').trim();
  let isMarked = Boolean(m.groups.mark);

  if (!isMarked && /^[#*+]\s*/.test(body)) {
    isMarked = true;
    body = body.replace(/^[#*+]\s*/, '').trim();
  }

  return {
    letter,
    isMarked,
    text: body,
    sep: m.groups.pLet ? '()' : m.groups.sep,
    rawLine: line,
  };
}

export function parseFormattedTestText(rawText) {
  const normalized = normalizeText(rawText);
  const rawLines = normalized.split('\n');

  const lines = [];
  for (const rl of rawLines) {
    const trimmed = rl.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const split = splitInlineOptions(trimmed);
    for (const part of split) lines.push(part);
  }

  const valid = [];
  const errors = [];

  let questionLines = [];
  let options = {};
  let currentOptLetter = null;
  let optionStyle = null; // ')' | '.' | '()'
  let markedCorrect = null;
  let explanationLines = [];
  let pendingAfterD = [];
  let sawAnyBlankAfterD = false;

  const hasAllFour = () => Boolean(options.A && options.B && options.C && options.D);
  const hasAnyOptions = () => Object.keys(options).length > 0;

  const finalizeQuestion = (extraLineOffset = 0) => {
    if (!hasAnyOptions() && questionLines.length === 0) return;

    const qNum = valid.length + errors.length + 1 + extraLineOffset;
    const joinedQ = questionLines
      .join(' ')
      .replace(Q_NUM_PREFIX_RE, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!joinedQ) {
      errors.push(`${qNum}-savol: Savol matni topilmadi.`);
    } else if (!options.A || !options.B || !options.C || !options.D) {
      const missing = ['A', 'B', 'C', 'D'].filter((l) => !options[l]).join(', ');
      errors.push(`${qNum}-savol ("${joinedQ.slice(0, 45)}..."): ${missing} variant(lar)i yetishmayapti.`);
    } else if (!markedCorrect) {
      errors.push(
        `${qNum}-savol ("${joinedQ.slice(0, 45)}..."): To‘g‘ri javob (# belgisi bilan, masalan #a)) ko‘rsatilmagan.`
      );
    } else {
      valid.push({
        question_text: joinedQ,
        expression_text: null,
        option_a: options.A.trim(),
        option_b: options.B.trim(),
        option_c: options.C.trim(),
        option_d: options.D.trim(),
        correct_option: markedCorrect,
        explanation: explanationLines.join(' ').trim(),
      });
    }

    questionLines = [];
    options = {};
    currentOptLetter = null;
    optionStyle = null;
    markedCorrect = null;
    explanationLines = [];
    pendingAfterD = [];
    sawAnyBlankAfterD = false;
  };

  for (const line of lines) {
    if (line === '') {
      if (hasAllFour() && pendingAfterD.length > 0) {
        // Text before the blank line after D was wrapped D text (unless explanation/hint); after blank line starts next question
        const beforeBlank = [];
        for (const pl of pendingAfterD) {
          const expM = EXPLANATION_RE.exec(pl);
          const ansM = ANSWER_HINT_RE.exec(pl);
          if (expM) explanationLines.push(expM[1].trim());
          else if (ansM && !markedCorrect) markedCorrect = mapOptionLetter(ansM[1]);
          else beforeBlank.push(pl);
        }
        if (beforeBlank.length > 0 && options.D) {
          options.D = `${options.D} ${beforeBlank.join(' ')}`.trim();
        }
        pendingAfterD = [];
        sawAnyBlankAfterD = true;
        finalizeQuestion();
      } else if (hasAllFour()) {
        sawAnyBlankAfterD = true;
      }
      continue;
    }

    // Check explicit explanation or answer hint lines
    const expMatch = EXPLANATION_RE.exec(line);
    if (expMatch && hasAnyOptions()) {
      explanationLines.push(expMatch[1].trim());
      continue;
    }
    const ansHint = ANSWER_HINT_RE.exec(line);
    if (ansHint && hasAnyOptions()) {
      if (!markedCorrect) markedCorrect = mapOptionLetter(ansHint[1]);
      continue;
    }

    const optMatch = parseOptionMatch(line);

    // Handle special edge case: question starts with initials like "A. Navoiy ..." before "#?a)"
    if (
      optMatch &&
      optMatch.letter === 'A' &&
      options.A &&
      !options.B &&
      optionStyle === '.' &&
      optMatch.sep === ')'
    ) {
      questionLines.push(`A. ${options.A}`.trim());
      options = {};
      markedCorrect = null;
      currentOptLetter = null;
      optionStyle = null;
    }

    // If all 4 options already collected: check if a new numbered question OR new 'a)' starts
    if (hasAllFour()) {
      const startsNumberedQuestion = Q_NUM_PREFIX_RE.test(line) && (!optMatch || optMatch.letter !== 'A');
      if (startsNumberedQuestion) {
        // Lines accumulated right after D (before a blank line and before this number) belong to D or explanation
        const wrappedD = [];
        for (const pl of pendingAfterD) {
          const eM = EXPLANATION_RE.exec(pl);
          const aM = ANSWER_HINT_RE.exec(pl);
          if (eM) explanationLines.push(eM[1].trim());
          else if (aM && !markedCorrect) markedCorrect = mapOptionLetter(aM[1]);
          else wrappedD.push(pl);
        }
        if (wrappedD.length > 0) {
          options.D = `${options.D} ${wrappedD.join(' ')}`.trim();
        }
        pendingAfterD = [];
        finalizeQuestion();
        questionLines.push(line);
        continue;
      }

      if (optMatch && optMatch.letter === 'A') {
        // Unnumbered question right before this A! Everything in pendingAfterD is the next question's text!
        const nextQ = [...pendingAfterD];
        pendingAfterD = [];
        finalizeQuestion();
        questionLines = nextQ;
        options.A = optMatch.text;
        currentOptLetter = 'A';
        optionStyle = optMatch.sep;
        if (optMatch.isMarked) markedCorrect = 'A';
        continue;
      }

      // Accumulate trailing text after D until we see blank line, question number, or next A
      if (sawAnyBlankAfterD) {
        finalizeQuestion();
        questionLines.push(line);
      } else {
        pendingAfterD.push(line);
      }
      continue;
    }

    // Not yet having all 4 options
    if (optMatch) {
      const l = optMatch.letter;
      // Avoid mistaking "A. Qahhor..." line if we already started seeing options and 'A' repeats -> only restart if no options or B already exists
      if (l === 'A' && options.A && (options.B || options.C || options.D)) {
        finalizeQuestion();
      }

      // If previous option was empty or continuing, start this option
      if (!options[l]) {
        options[l] = optMatch.text;
        currentOptLetter = l;
        optionStyle = optionStyle || optMatch.sep;
        if (optMatch.isMarked && !markedCorrect) {
          markedCorrect = l;
        }
        continue;
      }
    }

    // Plain non-option line
    if (hasAnyOptions() && currentOptLetter) {
      // Continuation of wrapped option text
      options[currentOptLetter] = `${options[currentOptLetter]} ${line}`.trim();
    } else {
      // If document starts with title lines before "1. ...", discard title header when explicit "1." arrives
      if (
        valid.length === 0 &&
        errors.length === 0 &&
        !hasAnyOptions() &&
        questionLines.length > 0 &&
        /^(?:1[.)]|№\s*1\b|Savol\s*1\b)/i.test(line)
      ) {
        questionLines = [line];
      } else {
        questionLines.push(line);
      }
    }
  }

  // Flush final question at EOF
  if (hasAllFour() && pendingAfterD.length > 0) {
    const tail = [];
    for (const pl of pendingAfterD) {
      const eM = EXPLANATION_RE.exec(pl);
      const aM = ANSWER_HINT_RE.exec(pl);
      if (eM) explanationLines.push(eM[1].trim());
      else if (aM && !markedCorrect) markedCorrect = mapOptionLetter(aM[1]);
      else tail.push(pl);
    }
    if (tail.length > 0 && options.D && !sawAnyBlankAfterD) {
      // Only attach very obvious non-question tails (e.g. if short & doesn't end with '?')
      const joinedTail = tail.join(' ');
      if (!joinedTail.endsWith('?') && !Q_NUM_PREFIX_RE.test(joinedTail)) {
        options.D = `${options.D} ${joinedTail}`.trim();
      }
    }
    pendingAfterD = [];
  }

  if (hasAnyOptions()) {
    finalizeQuestion();
  }

  return { valid, errors };
}

function reconstructPdfLines(pageItems) {
  if (!Array.isArray(pageItems) || pageItems.length === 0) return [];

  // Sort strictly descending by Y, then ascending by X
  const sorted = [...pageItems].sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 0.01) return dy;
    return a.x - b.x;
  });

  const lineBuckets = [];
  for (const item of sorted) {
    if (!item.str) continue;
    const tol = Math.max(2.5, (item.fontSize || 11) * 0.45);
    const lastBucket = lineBuckets[lineBuckets.length - 1];
    if (lastBucket && Math.abs(item.y - lastBucket.anchorY) <= tol) {
      lastBucket.items.push(item);
    } else {
      lineBuckets.push({ anchorY: item.y, items: [item] });
    }
  }

  const lines = [];
  for (let i = 0; i < lineBuckets.length; i++) {
    const bucket = lineBuckets[i];
    bucket.items.sort((a, b) => a.x - b.x);
    let lineText = '';
    let prevEndX = null;
    for (const it of bucket.items) {
      const text = it.str;
      if (prevEndX !== null && it.x - prevEndX > Math.max(1.5, (it.fontSize || 10) * 0.18)) {
        if (!lineText.endsWith(' ') && !text.startsWith(' ')) {
          lineText += ' ';
        }
      }
      lineText += text;
      prevEndX = it.x + (it.width || 0);
    }
    const cleanLine = lineText.trim();
    if (cleanLine) lines.push(cleanLine);

    const nextBucket = lineBuckets[i + 1];
    if (nextBucket && lastLineGapLarge(bucket, nextBucket)) {
      lines.push('');
    }
  }

  return lines;
}

function lastLineGapLarge(upper, lower) {
  const fontSize = upper.items[0]?.fontSize || 11;
  const gap = upper.anchorY - lower.anchorY;
  return gap > Math.max(18, fontSize * 1.9);
}

export async function extractAndParseTestBuffer(buffer, filename = '') {
  const ext = String(filename).split('.').pop()?.toLowerCase() || '';

  if (ext === 'doc') {
    // Check if an HTML or XML-based .doc was uploaded, vs legacy OLE binary
    const head = buffer.subarray(0, 8);
    const isOleBinary =
      head.length >= 4 && head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
    if (isOleBinary) {
      return {
        valid: [],
        errors: [
          'Eski .doc binary format qo‘llab-quvvatlanmaydi. Iltimos faylni Wordda .docx yoki .pdf formatida saqlab yuklang.',
        ],
        extracted_preview: '',
      };
    }
    const text = buffer.toString('utf8').replace(/<[^>]+>/g, '\n');
    const parsed = parseFormattedTestText(text);
    return { ...parsed, extracted_preview: text.slice(0, 600) };
  }

  if (ext === 'docx') {
    try {
      const { value: rawText } = await mammoth.extractRawText({ buffer });
      const parsed = parseFormattedTestText(rawText);
      return {
        ...parsed,
        extracted_preview: rawText.slice(0, 600),
      };
    } catch (err) {
      return {
        valid: [],
        errors: [
          `Word (.docx) faylini o‘qib bo‘lmadi (${err instanceof Error ? err.message : 'noto‘g‘ri fayl'}). Fayl buzilmagan va haqiqiy .docx ekanini tekshiring.`,
        ],
        extracted_preview: '',
      };
    }
  }

  if (ext === 'pdf') {
    let pdf = null;
    try {
      pdf = await getDocumentProxy(new Uint8Array(buffer));
      const [pagesInfo, textData] = await Promise.all([
        inspectPages(pdf),
        extractTextItems(pdf),
      ]);

      const totalTextLen = pagesInfo.pages.reduce((s, p) => s + (p.textLength || 0), 0);
      if (totalTextLen === 0) {
        return {
          valid: [],
          errors: [
            'Bu PDF skaner qilingan rasmga o‘xshaydi (matn qatlami topilmadi). Iltimos matnli PDF yoki Word (.docx) yuklang.',
          ],
          extracted_preview: '',
        };
      }

      const allLines = [];
      for (const pageItems of textData.items) {
        allLines.push(...reconstructPdfLines(pageItems));
        allLines.push('');
      }
      const rawText = allLines.join('\n');
      const parsed = parseFormattedTestText(rawText);
      return {
        ...parsed,
        extracted_preview: rawText.slice(0, 600),
      };
    } catch (err) {
      return {
        valid: [],
        errors: [
          `PDF faylini o‘qib bo‘lmadi (${err instanceof Error ? err.message : 'parol yoki noto‘g‘ri PDF'}).`,
        ],
        extracted_preview: '',
      };
    } finally {
      if (pdf && typeof pdf.destroy === 'function') {
        try {
          await pdf.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  if (ext === 'txt') {
    const rawText = buffer.toString('utf8');
    const parsed = parseFormattedTestText(rawText);
    return {
      ...parsed,
      extracted_preview: rawText.slice(0, 600),
    };
  }

  return {
    valid: [],
    errors: [`Qo‘llab-quvvatlanmaydigan fayl turi (.${ext}). Word (.docx), PDF (.pdf) yoki .txt yuklang.`],
    extracted_preview: '',
  };
}

const SAMPLE_TEST_LINES = [
  '1. O‘zbekiston Respublikasining poytaxti qaysi shahar?',
  '#a) Toshkent',
  'b) Samarqand',
  'c) Buxoro',
  'd) Xiva',
  '',
  '2. Ifodaning qiymati nechaga teng: 7 × 8',
  'a) 54',
  '#b) 56',
  'c) 64',
  'd) 58',
  '',
  '3. Tenglamani yeching: 2x + 6 = 18',
  'a) 4',
  'b) 5',
  '#c) 6',
  'd) 7',
];

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function buildSampleDocxBuffer() {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.folder('_rels').file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const paragraphsXml = SAMPLE_TEST_LINES.map(
    (line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
  ).join('\n    ');

  zip.folder('word').file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
    <w:sectPr/>
  </w:body>
</w:document>`
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}

export function getSampleTxtText() {
  return SAMPLE_TEST_LINES.join('\n');
}
