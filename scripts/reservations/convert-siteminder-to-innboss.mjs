import { access, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCsv, stringifyCsv } from "./csv-rfc4180.mjs";

export const INNBOSS_COLUMNS = [
  "guest_name",
  "guest_email",
  "guest_phone",
  "room_type",
  "check_in",
  "check_out",
  "adults",
  "children",
  "total_amount",
  "reference",
];

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, "..", "..");
const privateRoot = resolve(repositoryRoot, ".private", "reservations");
const fixtureRoot = resolve(repositoryRoot, "testing", "fixtures", "reservations");

const sourceAliases = {
  guest_name: ["Guest Name", "Primary Guest", "Booker Name", "Full Name"],
  first_name: ["First Name", "Guest First Name", "Booker First Name"],
  last_name: ["Last Name", "Guest Last Name", "Booker Last Name", "Surname"],
  guest_email: ["Guest Email", "Email", "Booker Email", "Contact Email"],
  guest_phone: ["Guest Phone", "Phone", "Mobile", "Contact Phone"],
  room_type: ["Room Type", "Room Name", "Accommodation", "Accommodation Type"],
  check_in: ["Check-in", "Check In", "Arrival", "Arrival Date"],
  check_out: ["Check-out", "Check Out", "Departure", "Departure Date"],
  adults: ["Adults", "Number of Adults", "Adult Guests"],
  children: ["Children", "Number of Children", "Child Guests"],
  total_amount: ["Reservation Total", "Booking Total", "Total Amount", "Gross Total"],
  reference: ["Reservation ID", "Booking ID", "Confirmation Number", "Reservation Reference"],
  status: ["Status", "Reservation Status", "Booking Status"],
  property: ["Property", "Hotel", "Accommodation Property"],
  currency: ["Currency", "Currency Code"],
  room_quantity: [
    "Room Quantity", "Room Qty", "Number of Rooms", "No. of Rooms", "No of Rooms",
    "Rooms Booked", "Room Count", "Units Booked", "Number of Units", "Accommodation Quantity",
  ],
};

const requiredSourceFields = [
  "room_type",
  "check_in",
  "check_out",
  "adults",
  "children",
  "total_amount",
  "reference",
];

export class ReservationConversionError extends Error {
  constructor(code, options = {}) {
    super(code);
    this.name = "ReservationConversionError";
    this.code = code;
    this.report = options.report;
  }
}

function normalizedToken(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function headerToken(value) {
  return normalizedToken(value).replaceAll(" ", "");
}

function isWithin(basePath, candidatePath) {
  const relation = relative(resolve(basePath), resolve(candidatePath));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

async function canonicalPath(path) {
  let cursor = resolve(path);
  const missingSegments = [];
  while (true) {
    try {
      const existing = await realpath(cursor);
      return resolve(existing, ...missingSegments);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      missingSegments.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

async function assertPrivatePath(path, role, fixture = false) {
  const absolute = resolve(path);
  let canonical;
  let canonicalRepository;
  let canonicalPrivate;
  let canonicalFixture;
  try {
    [canonical, canonicalRepository, canonicalPrivate, canonicalFixture] = await Promise.all([
      canonicalPath(absolute),
      canonicalPath(repositoryRoot),
      canonicalPath(privateRoot),
      canonicalPath(fixtureRoot),
    ]);
  } catch {
    throw new ReservationConversionError(`${role.toUpperCase()}_PATH_UNRESOLVED`);
  }

  if (role === "input" && fixture) {
    const expectedFixture = resolve(canonicalRepository, "testing", "fixtures", "reservations");
    if (canonicalFixture === expectedFixture && isWithin(canonicalFixture, canonical)) return;
    throw new ReservationConversionError("FIXTURE_INPUT_REQUIRED");
  }

  if (!isWithin(canonicalRepository, canonical)) return;
  const expectedPrivate = resolve(canonicalRepository, ".private", "reservations");
  if (canonicalPrivate === expectedPrivate && isWithin(canonicalPrivate, canonical)) return;
  throw new ReservationConversionError(`${role.toUpperCase()}_PATH_NOT_PRIVATE`);
}

function resolveColumns(headers) {
  const byToken = new Map();
  for (const header of headers) {
    const token = headerToken(header);
    const values = byToken.get(token) || [];
    values.push(header);
    byToken.set(token, values);
  }

  const columns = {};
  for (const [field, aliases] of Object.entries(sourceAliases)) {
    const matches = new Set();
    for (const alias of aliases) {
      for (const header of byToken.get(headerToken(alias)) || []) matches.add(header);
    }
    if (matches.size > 1) throw new ReservationConversionError(`AMBIGUOUS_HEADER_${field.toUpperCase()}`);
    columns[field] = [...matches][0] || null;
  }
  return columns;
}

function mappingTextValid(value) {
  return typeof value === "string" && textValue(value, 200) === value;
}

function validateMapping(config, fixture) {
  if (!config || config.version !== 1 || !config.targets || typeof config.targets !== "object") {
    throw new ReservationConversionError("MAPPING_CONFIG_INVALID");
  }
  if (!config.innboss_schema || !Array.isArray(config.innboss_schema.columns)) {
    throw new ReservationConversionError("TARGET_SCHEMA_MISSING");
  }
  if (config.innboss_schema.delimiter !== "," || config.innboss_schema.date_format !== "YYYY-MM-DD") {
    throw new ReservationConversionError("TARGET_SCHEMA_FORMAT_UNSUPPORTED");
  }
  if (config.innboss_schema.columns.join("\u0000") !== INNBOSS_COLUMNS.join("\u0000")) {
    throw new ReservationConversionError("TARGET_SCHEMA_COLUMNS_MISMATCH");
  }
  if (!fixture && config.innboss_schema.verified !== true) {
    throw new ReservationConversionError("TARGET_SCHEMA_UNVERIFIED");
  }

  const targets = new Map();
  const propertyAliases = new Map();
  const globalRoomAliases = new Map();

  for (const [id, target] of Object.entries(config.targets)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new ReservationConversionError("MAPPING_TARGET_ID_INVALID");
    }
    if (
      !mappingTextValid(target?.label)
      || !Array.isArray(target.property_aliases)
      || !target.property_aliases.every(mappingTextValid)
      || !Array.isArray(target.rooms)
    ) {
      throw new ReservationConversionError("MAPPING_TARGET_INVALID");
    }
    const roomAliases = new Map();
    const rooms = new Map();
    for (const room of target.rooms) {
      if (
        !mappingTextValid(room?.target)
        || !Number.isInteger(room.inventory)
        || room.inventory < 1
        || !Array.isArray(room.aliases)
        || !room.aliases.every(mappingTextValid)
      ) {
        throw new ReservationConversionError("MAPPING_ROOM_INVALID");
      }
      if (rooms.has(room.target)) throw new ReservationConversionError("MAPPING_ROOM_DUPLICATE");
      rooms.set(room.target, { target: room.target, inventory: room.inventory });
      const aliases = new Set([room.target, ...room.aliases]);
      for (const alias of aliases) {
        const token = normalizedToken(alias);
        if (!token) throw new ReservationConversionError("MAPPING_ROOM_ALIAS_EMPTY");
        const existing = roomAliases.get(token);
        if (existing && existing !== room.target) throw new ReservationConversionError("MAPPING_ROOM_ALIAS_COLLISION");
        roomAliases.set(token, room.target);
        const candidates = globalRoomAliases.get(token) || [];
        candidates.push({ targetId: id, room: room.target });
        globalRoomAliases.set(token, candidates);
      }
    }
    if (!rooms.size) throw new ReservationConversionError("MAPPING_TARGET_WITHOUT_ROOMS");
    targets.set(id, { id, label: target.label, rooms, roomAliases });

    for (const alias of new Set([id, target.label, ...target.property_aliases])) {
      const token = normalizedToken(alias);
      if (!token) throw new ReservationConversionError("MAPPING_PROPERTY_ALIAS_EMPTY");
      const existing = propertyAliases.get(token);
      if (existing && existing !== id) throw new ReservationConversionError("MAPPING_PROPERTY_ALIAS_COLLISION");
      propertyAliases.set(token, id);
    }
  }

  if (!targets.size) throw new ReservationConversionError("MAPPING_TARGETS_EMPTY");
  return { targets, propertyAliases, globalRoomAliases };
}

function calendarDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger)) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value, dateOrder) {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const separated = /^(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})$/.exec(text);
  if (!separated || !dateOrder) return null;
  const values = separated.slice(1).map(Number);
  const positions = Object.fromEntries([...dateOrder].map((part, index) => [part, values[index]]));
  if (!positions.y || positions.y < 1000) return null;
  return calendarDate(positions.y, positions.m, positions.d);
}

function integerValue(value, minimum) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

function moneyValue(value) {
  const text = String(value ?? "").trim().replace(/^US\$/i, "").replace(/^\$/, "").trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const number = Number(text.replaceAll(",", ""));
  if (!Number.isFinite(number) || number < 0 || number > 100000000) return null;
  return number.toFixed(2);
}

function statusValue(value) {
  const token = normalizedToken(value);
  if (["confirmed", "reserved", "booked", "confirmation"].includes(token)) return "confirmed";
  if (["checked in", "checkedin", "in house", "inhouse"].includes(token)) return "checked-in";
  return null;
}

function currencyIsUsd(value) {
  return ["usd", "us dollar", "us dollars", "$", "us$"].includes(String(value ?? "").trim().toLowerCase());
}

function unsafeSpreadsheetText(value) {
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(String(value ?? ""));
}

function textValue(value, maximum, allowEmpty = false) {
  const text = String(value ?? "").trim();
  if ((!allowEmpty && !text) || text.length > maximum || /[\r\n\t\u0000]/.test(text) || unsafeSpreadsheetText(text)) return null;
  return text;
}

function phoneValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length > 50 || !/^[+\d][\d\s().+\-/#]*$/.test(text) || /[\r\n\t\u0000]/.test(text)) return null;
  return text;
}

function resolveRoom(mapping, propertyRaw, roomRaw, propertyHint) {
  let targetId = propertyHint || null;
  const propertyText = String(propertyRaw ?? "").trim();
  if (propertyText) {
    const sourceTargetId = mapping.propertyAliases.get(normalizedToken(propertyRaw)) || null;
    if (!sourceTargetId) return { error: "PROPERTY_UNMAPPED" };
    if (targetId && sourceTargetId !== targetId) return { error: "PROPERTY_HINT_CONFLICT" };
    targetId = sourceTargetId;
  } else if (!targetId) {
    return { error: "PROPERTY_EMPTY" };
  }

  const roomToken = normalizedToken(roomRaw);
  if (targetId) {
    const target = mapping.targets.get(targetId);
    if (!target) return { error: "PROPERTY_HINT_INVALID" };
    const room = target.roomAliases.get(roomToken);
    return room ? { targetId, room } : { error: "ROOM_UNMAPPED" };
  }

  const unique = new Map();
  for (const candidate of mapping.globalRoomAliases.get(roomToken) || []) {
    unique.set(`${candidate.targetId}\u0000${candidate.room}`, candidate);
  }
  if (unique.size === 0) return { error: "ROOM_UNMAPPED" };
  if (unique.size > 1) return { error: "ROOM_PROPERTY_AMBIGUOUS" };
  return [...unique.values()][0];
}

function addIssue(issues, row, field, code) {
  issues.push({ row, field, code });
}

function validateOptions(options, mapping) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.asOf || "") || parseDate(options.asOf) !== options.asOf) {
    throw new ReservationConversionError("AS_OF_DATE_INVALID");
  }
  if (options.dateOrder && !["dmy", "mdy", "ymd"].includes(options.dateOrder)) {
    throw new ReservationConversionError("DATE_ORDER_INVALID");
  }
  if (options.defaultStatus && !statusValue(options.defaultStatus)) {
    throw new ReservationConversionError("DEFAULT_STATUS_INVALID");
  }
  if (options.defaultCurrency && !currencyIsUsd(options.defaultCurrency)) {
    throw new ReservationConversionError("DEFAULT_CURRENCY_NOT_USD");
  }
  if (options.propertyHint && !mapping.targets.has(options.propertyHint)) {
    throw new ReservationConversionError("PROPERTY_HINT_INVALID");
  }
}

function overlapPeak(rows) {
  const events = [];
  for (const row of rows) {
    events.push({ date: row.check_in, change: 1, row: row.__row });
    events.push({ date: row.check_out, change: -1, row: row.__row });
  }
  events.sort((left, right) => left.date.localeCompare(right.date) || left.change - right.change);
  let active = 0;
  let peak = 0;
  let peakRow = 0;
  for (const event of events) {
    active += event.change;
    if (active > peak) {
      peak = active;
      peakRow = event.row;
    }
  }
  return { peak, peakRow };
}

export function convertReservationData({ sourceText, mappingConfig, options }) {
  const fixture = options.fixture === true;
  const mapping = validateMapping(mappingConfig, fixture);
  validateOptions(options, mapping);

  let parsed;
  try {
    parsed = parseCsv(sourceText, { delimiter: options.delimiter });
  } catch (error) {
    throw new ReservationConversionError(error.message.startsWith("CSV_") ? error.message : "CSV_PARSE_FAILED");
  }

  const columns = resolveColumns(parsed.headers);
  const issues = [];
  const warnings = [];
  for (const field of requiredSourceFields) {
    if (!columns[field]) addIssue(issues, 1, field, "REQUIRED_HEADER_MISSING");
  }
  if (!columns.guest_name && !(columns.first_name && columns.last_name)) {
    addIssue(issues, 1, "guest_name", "GUEST_NAME_HEADER_MISSING");
  }
  if (!columns.status && !options.defaultStatus) addIssue(issues, 1, "status", "STATUS_HEADER_OR_DEFAULT_REQUIRED");
  if (!columns.property && !options.propertyHint) addIssue(issues, 1, "property", "PROPERTY_HEADER_OR_HINT_REQUIRED");
  if (!columns.currency && !options.defaultCurrency) addIssue(issues, 1, "currency", "CURRENCY_HEADER_OR_DEFAULT_REQUIRED");

  const candidates = [];
  if (!issues.length) {
    for (let index = 0; index < parsed.rows.length; index += 1) {
      const source = parsed.rows[index];
      const rowNumber = index + 2;
      const rowIssueStart = issues.length;
      const raw = (field) => (columns[field] ? source[columns[field]] : "");

      const joinedName = columns.guest_name ? raw("guest_name") : `${raw("first_name")} ${raw("last_name")}`;
      const guestName = textValue(joinedName, 200);
      if (!guestName) addIssue(issues, rowNumber, "guest_name", "GUEST_NAME_INVALID");

      const emailRaw = String(raw("guest_email") ?? "").trim();
      const guestEmail = emailRaw ? textValue(emailRaw, 254) : "";
      if (emailRaw && (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail))) {
        addIssue(issues, rowNumber, "guest_email", "GUEST_EMAIL_INVALID");
      } else if (!emailRaw) {
        warnings.push({ row: rowNumber, field: "guest_email", code: "GUEST_EMAIL_EMPTY" });
      }

      const guestPhone = phoneValue(raw("guest_phone"));
      if (guestPhone === null) addIssue(issues, rowNumber, "guest_phone", "GUEST_PHONE_INVALID");
      else if (!guestPhone) warnings.push({ row: rowNumber, field: "guest_phone", code: "GUEST_PHONE_EMPTY" });

      const roomResult = resolveRoom(mapping, raw("property"), raw("room_type"), options.propertyHint);
      if (roomResult.error) {
        addIssue(issues, rowNumber, roomResult.error.startsWith("PROPERTY_") ? "property" : "room_type", roomResult.error);
      }

      const checkIn = parseDate(raw("check_in"), options.dateOrder);
      const checkOut = parseDate(raw("check_out"), options.dateOrder);
      if (!checkIn) addIssue(issues, rowNumber, "check_in", "CHECK_IN_DATE_INVALID_OR_AMBIGUOUS");
      if (!checkOut) addIssue(issues, rowNumber, "check_out", "CHECK_OUT_DATE_INVALID_OR_AMBIGUOUS");
      if (checkIn && checkOut && checkOut <= checkIn) addIssue(issues, rowNumber, "check_out", "CHECK_OUT_NOT_AFTER_CHECK_IN");

      const status = statusValue(columns.status ? raw("status") : options.defaultStatus);
      if (!status) {
        addIssue(issues, rowNumber, "status", "UNEXPECTED_STATUS");
      } else if (checkIn && checkOut) {
        const inScope = status === "confirmed"
          ? checkIn >= options.asOf
          : checkIn <= options.asOf && checkOut > options.asOf;
        if (!inScope) addIssue(issues, rowNumber, "status", "RESERVATION_OUTSIDE_APPROVED_SCOPE");
      }

      const adults = integerValue(raw("adults"), 1);
      const children = integerValue(raw("children"), 0);
      if (adults === null) addIssue(issues, rowNumber, "adults", "ADULT_COUNT_INVALID");
      if (children === null) addIssue(issues, rowNumber, "children", "CHILD_COUNT_INVALID");

      if (columns.room_quantity) {
        const roomQuantity = integerValue(raw("room_quantity"), 1);
        if (roomQuantity === null) addIssue(issues, rowNumber, "room_quantity", "ROOM_QUANTITY_INVALID");
        else if (roomQuantity !== 1) addIssue(issues, rowNumber, "room_quantity", "MULTI_ROOM_ROW_NOT_SUPPORTED");
      }

      const totalAmount = moneyValue(raw("total_amount"));
      if (totalAmount === null) addIssue(issues, rowNumber, "total_amount", "TOTAL_AMOUNT_INVALID");

      const currency = columns.currency ? raw("currency") : options.defaultCurrency;
      if (!currencyIsUsd(currency)) addIssue(issues, rowNumber, "currency", "CURRENCY_NOT_USD");

      const reference = textValue(raw("reference"), 200);
      if (!reference) addIssue(issues, rowNumber, "reference", "REFERENCE_INVALID");

      if (issues.length === rowIssueStart) {
        candidates.push({
          __row: rowNumber,
          __target: roomResult.targetId,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          room_type: roomResult.room,
          check_in: checkIn,
          check_out: checkOut,
          adults: String(adults),
          children: String(children),
          total_amount: totalAmount,
          reference,
        });
      }
    }
  }

  const references = new Map();
  const probableDuplicates = new Map();
  for (const candidate of candidates) {
    const referenceKey = normalizedToken(candidate.reference);
    if (references.has(referenceKey)) {
      const previous = references.get(referenceKey);
      const comparable = INNBOSS_COLUMNS.every((column) => previous[column] === candidate[column])
        && previous.__target === candidate.__target;
      addIssue(issues, candidate.__row, "reference", comparable ? "DUPLICATE_REFERENCE" : "CONFLICTING_REFERENCE");
    } else {
      references.set(referenceKey, candidate);
    }

    const identities = [];
    if (candidate.guest_email) identities.push(`email:${candidate.guest_email.trim().toLowerCase()}`);
    if (candidate.guest_phone) identities.push(`phone:${candidate.guest_phone.replace(/\D/g, "")}`);
    if (!identities.length) identities.push(`name:${normalizedToken(candidate.guest_name)}`);
    let probableDuplicate = false;
    for (const identity of identities) {
      const composite = [
        candidate.__target,
        candidate.room_type,
        candidate.check_in,
        candidate.check_out,
        identity,
      ].join("\u0000");
      if (probableDuplicates.has(composite)) probableDuplicate = true;
      else probableDuplicates.set(composite, candidate.__row);
    }
    if (probableDuplicate) addIssue(issues, candidate.__row, "reference", "PROBABLE_DUPLICATE");
  }

  for (const target of mapping.targets.values()) {
    for (const room of target.rooms.values()) {
      const roomRows = candidates.filter((candidate) => candidate.__target === target.id && candidate.room_type === room.target);
      const { peak, peakRow } = overlapPeak(roomRows);
      if (peak > room.inventory) addIssue(issues, peakRow, "room_type", "INVENTORY_CAPACITY_EXCEEDED");
    }
  }

  const grouped = Object.fromEntries([...mapping.targets.keys()].map((id) => [id, []]));
  for (const candidate of candidates) {
    const output = Object.fromEntries(INNBOSS_COLUMNS.map((column) => [column, candidate[column]]));
    grouped[candidate.__target].push(output);
  }

  const counts = Object.fromEntries(Object.entries(grouped).map(([id, rows]) => [id, rows.length]));
  const report = {
    schemaVersion: 1,
    asOf: options.asOf,
    sourceRows: parsed.rows.length,
    candidateRows: candidates.length,
    acceptedRows: issues.length ? 0 : candidates.length,
    propertyRowCounts: counts,
    blockingIssueCount: issues.length,
    warningCount: warnings.length,
    issues,
    warnings,
  };

  return { ok: issues.length === 0, grouped, report };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function convertReservationFile({ input, map, outputDir, ...options }) {
  if (!input || !map || !outputDir) throw new ReservationConversionError("REQUIRED_ARGUMENT_MISSING");
  await assertPrivatePath(input, "input", options.fixture === true);
  await assertPrivatePath(outputDir, "output", false);

  let sourceBuffer;
  let mappingBuffer;
  try {
    [sourceBuffer, mappingBuffer] = await Promise.all([
      readFile(resolve(input)),
      readFile(resolve(map)),
    ]);
  } catch {
    throw new ReservationConversionError("INPUT_OR_MAPPING_READ_FAILED");
  }

  let sourceText;
  let mappingText;
  try {
    sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBuffer);
  } catch {
    throw new ReservationConversionError("INPUT_ENCODING_NOT_UTF8");
  }
  try {
    mappingText = new TextDecoder("utf-8", { fatal: true }).decode(mappingBuffer);
  } catch {
    throw new ReservationConversionError("MAPPING_ENCODING_NOT_UTF8");
  }
  let mappingConfig;
  try {
    mappingConfig = JSON.parse(mappingText);
  } catch {
    throw new ReservationConversionError("MAPPING_JSON_INVALID");
  }

  const conversion = convertReservationData({ sourceText, mappingConfig, options });
  if (!conversion.ok) throw new ReservationConversionError("VALIDATION_FAILED", { report: conversion.report });

  const outputRoot = resolve(outputDir);
  const payloads = [];
  for (const [targetId, rows] of Object.entries(conversion.grouped)) {
    if (!rows.length) continue;
    payloads.push({
      path: join(outputRoot, `${targetId}-innboss.csv`),
      content: stringifyCsv(rows, INNBOSS_COLUMNS),
    });
  }
  payloads.push({
    path: join(outputRoot, "reservation-conversion-report.json"),
    content: `${JSON.stringify({ generatedAt: new Date().toISOString(), ...conversion.report }, null, 2)}\n`,
  });

  for (const payload of payloads) {
    if (await pathExists(payload.path)) throw new ReservationConversionError("OUTPUT_ALREADY_EXISTS");
  }

  await mkdir(outputRoot, { recursive: true });
  await assertPrivatePath(outputRoot, "output", false);
  const created = [];
  try {
    for (const payload of payloads) {
      await writeFile(payload.path, payload.content, { encoding: "utf8", flag: "wx" });
      created.push(payload.path);
    }
  } catch {
    await Promise.all(created.map((path) => rm(path, { force: true })));
    throw new ReservationConversionError("OUTPUT_WRITE_FAILED");
  }

  return { ...conversion.report, outputFileCount: payloads.length };
}

function usage() {
  return [
    "Offline reservation CSV validation/conversion (no network or import side effects).",
    "",
    "Required:",
    "  --input <private CSV> --map <mapping JSON> --output-dir <private directory> --as-of YYYY-MM-DD",
    "",
    "Usually required:",
    "  --date-order dmy|mdy|ymd --default-currency USD",
    "",
    "Optional:",
    "  --property-hint prospect|providence|st-silas",
    "  --default-status confirmed|checked-in",
    "  --delimiter comma|semicolon|tab",
    "  --fixture (synthetic repository fixtures only)",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {};
  const valueOptions = new Set([
    "input", "map", "output-dir", "as-of", "date-order", "default-currency",
    "property-hint", "default-status", "delimiter",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--fixture") {
      options.fixture = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (!argument.startsWith("--") || !valueOptions.has(argument.slice(2)) || index + 1 >= argv.length) {
      throw new ReservationConversionError("ARGUMENT_INVALID");
    }
    options[argument.slice(2)] = argv[index + 1];
    index += 1;
  }
  if (options.delimiter) {
    const delimiters = { comma: ",", semicolon: ";", tab: "\t" };
    if (!delimiters[options.delimiter]) throw new ReservationConversionError("DELIMITER_ARGUMENT_INVALID");
    options.delimiter = delimiters[options.delimiter];
  }
  return options;
}

async function main() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  if (argumentsMap.help) {
    console.log(usage());
    return;
  }
  const report = await convertReservationFile({
    input: argumentsMap.input,
    map: argumentsMap.map,
    outputDir: argumentsMap["output-dir"],
    asOf: argumentsMap["as-of"],
    dateOrder: argumentsMap["date-order"],
    defaultCurrency: argumentsMap["default-currency"],
    propertyHint: argumentsMap["property-hint"],
    defaultStatus: argumentsMap["default-status"],
    delimiter: argumentsMap.delimiter,
    fixture: argumentsMap.fixture === true,
  });
  console.log(JSON.stringify({
    ok: true,
    sourceRows: report.sourceRows,
    acceptedRows: report.acceptedRows,
    propertyRowCounts: report.propertyRowCounts,
    warningCount: report.warningCount,
    outputFileCount: report.outputFileCount,
  }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    if (error instanceof ReservationConversionError) {
      console.error(JSON.stringify({
        ok: false,
        code: error.code,
        blockingIssueCount: error.report?.blockingIssueCount || 0,
        warningCount: error.report?.warningCount || 0,
        issues: error.report?.issues || [],
      }, null, 2));
      process.exitCode = 1;
    } else {
      console.error(JSON.stringify({ ok: false, code: "UNEXPECTED_FAILURE" }));
      process.exitCode = 1;
    }
  });
}
