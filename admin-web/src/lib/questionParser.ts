import * as XLSX from 'xlsx';
import type { CorrectOption, ParsedQuestionInput, ParseResult } from '../types';

function pickField(row: Record<string, unknown>, keys: string[]): string {
  const normalizedMap: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    normalizedMap[k.trim().toLowerCase().replace(/[\s-]+/g, '_')] = v;
  }
  for (const key of keys) {
    const val = normalizedMap[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function normalizeCorrect(raw: string): CorrectOption | null {
  const clean = raw.trim().toUpperCase();
  if (clean === 'A' || clean === 'B' || clean === 'C' || clean === 'D') {
    return clean;
  }
  if (clean === '1') return 'A';
  if (clean === '2') return 'B';
  if (clean === '3') return 'C';
  if (clean === '4') return 'D';
  return null;
}

function validateRows(rows: Record<string, unknown>[]): ParseResult {
  const valid: ParsedQuestionInput[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const lineNo = index + 2;
    const question_text = pickField(row, ['question_text', 'question', 'savol', 'matn']);
    const expression_text = pickField(row, ['expression_text', 'expression', 'formula', 'ifoda']) || null;
    const option_a = pickField(row, ['option_a', 'a', 'variant_a']);
    const option_b = pickField(row, ['option_b', 'b', 'variant_b']);
    const option_c = pickField(row, ['option_c', 'c', 'variant_c']);
    const option_d = pickField(row, ['option_d', 'd', 'variant_d']);
    const rawCorrect = pickField(row, ['correct_option', 'correct', 'answer', 'togri_javob', 'javob']);
    const explanation = pickField(row, ['explanation', 'izoh', 'note']);

    const correct_option = normalizeCorrect(rawCorrect);

    if (!question_text) {
      errors.push(`${lineNo}-qator: "question_text" (savol matni) bo‘sh.`);
      return;
    }
    if (!option_a || !option_b || !option_c || !option_d) {
      errors.push(`${lineNo}-qator: A, B, C, D variantlarning barchasi to‘ldirilishi shart.`);
      return;
    }
    if (!correct_option) {
      errors.push(`${lineNo}-qator: "correct_option" faqat A, B, C yoki D bo‘lishi kerak (hozir: "${rawCorrect}").`);
      return;
    }

    valid.push({
      question_text,
      expression_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      explanation,
    });
  });

  return { valid, errors };
}

export async function parseQuestionFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'json') {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(rows)) {
      return {
        valid: [],
        errors: ['JSON fayl massiv ([...]) yoki { "questions": [...] } ko‘rinishida bo‘lishi kerak.'],
      };
    }
    return validateRows(rows);
  }

  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { valid: [], errors: ['Fayl ichida jadval varag‘i topilmadi.'] };
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (rows.length === 0) {
      return { valid: [], errors: ['Faylda birorta ham savol qatori topilmadi.'] };
    }
    return validateRows(rows);
  }

  return {
    valid: [],
    errors: ['Faqat .csv, .json yoki .xlsx formatdagi fayllar qo‘llab-quvvatlanadi.'],
  };
}

const SAMPLE_ROWS = [
  {
    question_text: 'Ifodaning qiymati nechaga teng?',
    expression_text: '7 × 8',
    option_a: '54',
    option_b: '56',
    option_c: '64',
    option_d: '58',
    correct_option: 'B',
    explanation: '7 ni 8 ga ko‘paytirganda 56 hosil bo‘ladi.',
  },
  {
    question_text: 'Tenglamani yeching: x ni toping',
    expression_text: '2x + 6 = 18',
    option_a: '4',
    option_b: '5',
    option_c: '6',
    option_d: '7',
    correct_option: 'C',
    explanation: '2x = 12, demak x = 6.',
  },
];

export function downloadSampleTemplate(format: 'xlsx' | 'csv' | 'json') {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(SAMPLE_ROWS, null, 2)], { type: 'application/json' });
    triggerDownload(blob, 'dono-savollar-shablon.json');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Savollar');

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, 'dono-savollar-shablon.csv');
  } else {
    XLSX.writeFile(workbook, 'dono-savollar-shablon.xlsx');
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

