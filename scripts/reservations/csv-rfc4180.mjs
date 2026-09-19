const delimiterCandidates = [",", ";", "\t"];

function parseRecords(source, delimiter) {
  const text = String(source ?? "").replace(/^\uFEFF/, "");
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === delimiter) {
        record.push(field);
        field = "";
        afterQuote = false;
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        record.push(field);
        records.push(record);
        record = [];
        field = "";
        afterQuote = false;
      } else {
        throw new Error("CSV_CHARACTERS_AFTER_CLOSING_QUOTE");
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new Error("CSV_UNEXPECTED_QUOTE");
    } else if (character === delimiter) {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV_UNTERMINATED_QUOTE");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  while (records.length && records.at(-1).every((value) => value === "")) records.pop();
  return records;
}

export function detectDelimiter(text) {
  const scored = delimiterCandidates.map((delimiter) => {
    try {
      const records = parseRecords(text, delimiter);
      const width = records[0]?.length || 0;
      const consistent = records.slice(0, 20).filter((record) => record.length === width).length;
      return { delimiter, score: width * 100 + consistent };
    } catch {
      return { delimiter, score: -1 };
    }
  });
  scored.sort((left, right) => right.score - left.score);
  if (scored[0].score < 201) throw new Error("CSV_DELIMITER_NOT_DETECTED");
  return scored[0].delimiter;
}

export function parseCsv(text, options = {}) {
  const delimiter = options.delimiter || detectDelimiter(text);
  if (!delimiterCandidates.includes(delimiter)) throw new Error("CSV_DELIMITER_UNSUPPORTED");
  const records = parseRecords(text, delimiter);
  if (records.length < 2) throw new Error("CSV_REQUIRES_HEADER_AND_DATA");

  const headers = records[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("CSV_EMPTY_HEADER");
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw new Error("CSV_DUPLICATE_HEADER");
  }

  const rows = records.slice(1).map((record, index) => {
    if (record.length !== headers.length) {
      const error = new Error("CSV_COLUMN_COUNT_MISMATCH");
      error.rowNumber = index + 2;
      throw error;
    }
    return Object.fromEntries(headers.map((header, column) => [header, record[column]]));
  });

  return { delimiter, headers, rows };
}

function quoteCsv(value, delimiter) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function stringifyCsv(rows, headers, options = {}) {
  const delimiter = options.delimiter || ",";
  if (!delimiterCandidates.includes(delimiter)) throw new Error("CSV_DELIMITER_UNSUPPORTED");
  const lines = [headers.map((header) => quoteCsv(header, delimiter)).join(delimiter)];
  for (const row of rows) {
    lines.push(headers.map((header) => quoteCsv(row[header], delimiter)).join(delimiter));
  }
  return `${lines.join("\r\n")}\r\n`;
}
