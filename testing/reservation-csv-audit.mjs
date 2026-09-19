import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import {
  INNBOSS_COLUMNS,
  ReservationConversionError,
  convertReservationData,
  convertReservationFile,
} from "../scripts/reservations/convert-siteminder-to-innboss.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(".");
const fixtureRoot = resolve(root, "testing", "fixtures", "reservations");
const sourcePath = resolve(fixtureRoot, "siteminder-dummy.csv");
const mappingPath = resolve(root, "scripts", "reservations", "room-map.example.json");
const expectedRoot = resolve(fixtureRoot, "expected");
const evidencePath = resolve(root, "testing", "evidence", "reservation-csv-audit.json");
const converterPath = resolve(root, "scripts", "reservations", "convert-siteminder-to-innboss.mjs");
const allowedSyntheticCsv = new Set([
  resolve(fixtureRoot, "siteminder-dummy.csv"),
  resolve(fixtureRoot, "expected", "prospect-innboss.csv"),
  resolve(fixtureRoot, "expected", "providence-innboss.csv"),
  resolve(fixtureRoot, "expected", "st-silas-innboss.csv"),
]);
const results = [];
let temporaryRoot;

function record(suite, check, passed, detail = "") {
  results.push({ suite, check, passed: Boolean(passed), detail: String(detail || "") });
}

function normalizedNewlines(value) {
  return String(value).replace(/\r\n/g, "\n");
}

async function expectError(suite, check, expectedCode, action) {
  try {
    await action();
    record(suite, check, false, "operation unexpectedly succeeded");
  } catch (error) {
    record(suite, check, error instanceof ReservationConversionError && error.code === expectedCode, error.code || "unexpected error type");
  }
}

async function walk(directory, excludedDirectories = new Set()) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    if (excludedDirectories.has(entry.name) || entry.name.startsWith(".codex-")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, excludedDirectories));
    else files.push(path);
  }
  return files;
}

function options(overrides = {}) {
  return {
    asOf: "2026-09-19",
    dateOrder: "dmy",
    fixture: true,
    ...overrides,
  };
}

try {
  temporaryRoot = await mkdtemp(join(tmpdir(), "bestevillas-reservation-audit-"));
  const sourceText = await readFile(sourcePath, "utf8");
  const dataLines = sourceText.trimEnd().split(/\r?\n/);
  const mappingConfig = JSON.parse(await readFile(mappingPath, "utf8"));

  const parsed = convertReservationData({ sourceText, mappingConfig, options: options() });
  record("conversion", "synthetic fixture passes validation", parsed.ok && parsed.report.acceptedRows === 5, JSON.stringify({ accepted: parsed.report.acceptedRows }));
  record("conversion", "multiline quoted field does not disturb row parsing", parsed.report.sourceRows === 5);
  record("conversion", "rows split across all three private properties", JSON.stringify(parsed.report.propertyRowCounts) === JSON.stringify({ prospect: 3, providence: 1, "st-silas": 1 }));

  const unsafeTargetMapping = structuredClone(mappingConfig);
  unsafeTargetMapping.targets["../escape"] = unsafeTargetMapping.targets.prospect;
  delete unsafeTargetMapping.targets.prospect;
  await expectError("safety", "mapping target IDs cannot traverse outside the output directory", "MAPPING_TARGET_ID_INVALID", () => convertReservationData({
    sourceText,
    mappingConfig: unsafeTargetMapping,
    options: options(),
  }));

  const unsafeRoomMapping = structuredClone(mappingConfig);
  unsafeRoomMapping.targets.prospect.rooms[0].target = "=UNSAFE()";
  await expectError("safety", "formula-leading room targets cannot reach generated CSV", "MAPPING_ROOM_INVALID", () => convertReservationData({
    sourceText,
    mappingConfig: unsafeRoomMapping,
    options: options(),
  }));

  const outputRoot = join(temporaryRoot, "direct-output");
  const report = await convertReservationFile({
    input: sourcePath,
    map: mappingPath,
    outputDir: outputRoot,
    ...options(),
  });
  record("files", "three property CSV files plus one redacted report are written", report.outputFileCount === 4);

  for (const file of ["prospect-innboss.csv", "providence-innboss.csv", "st-silas-innboss.csv"]) {
    const [actual, expected] = await Promise.all([
      readFile(join(outputRoot, file), "utf8"),
      readFile(join(expectedRoot, file), "utf8"),
    ]);
    record("files", `${file} matches approved synthetic output`, normalizedNewlines(actual) === normalizedNewlines(expected));
  }

  const redactedReport = await readFile(join(outputRoot, "reservation-conversion-report.json"), "utf8");
  const fixtureSecrets = ["Alice Example", "alice@example.invalid", "+1 202 555 0101", "DEMO-001"];
  record("privacy", "written report contains aggregates only", fixtureSecrets.every((value) => !redactedReport.includes(value)));

  await expectError("safety", "existing outputs cannot be overwritten", "OUTPUT_ALREADY_EXISTS", () => convertReservationFile({
    input: sourcePath,
    map: mappingPath,
    outputDir: outputRoot,
    ...options(),
  }));

  await expectError("privacy", "repository fixture is refused as a real guest input", "INPUT_PATH_NOT_PRIVATE", () => convertReservationFile({
    input: sourcePath,
    map: mappingPath,
    outputDir: join(temporaryRoot, "privacy-output"),
    ...options({ fixture: false }),
  }));

  const linkedOutput = join(temporaryRoot, "linked-output");
  try {
    await symlink(resolve(root, "content"), linkedOutput, process.platform === "win32" ? "junction" : "dir");
    await expectError("privacy", "output junctions cannot redirect private files into the public repository", "OUTPUT_PATH_NOT_PRIVATE", () => convertReservationFile({
      input: sourcePath,
      map: mappingPath,
      outputDir: linkedOutput,
      ...options(),
    }));
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) record("privacy", "output junction test unavailable on this host", true, "host does not permit test junctions");
    else throw error;
  }

  const externalInput = join(temporaryRoot, "schema-input.csv");
  await writeFile(externalInput, sourceText, "utf8");
  await expectError("privacy", "fixture mode cannot be used with an external or real input", "FIXTURE_INPUT_REQUIRED", () => convertReservationFile({
    input: externalInput,
    map: mappingPath,
    outputDir: join(temporaryRoot, "fixture-bypass-output"),
    ...options(),
  }));
  await expectError("safety", "unverified InnBoss example schema blocks real conversion", "TARGET_SCHEMA_UNVERIFIED", () => convertReservationFile({
    input: externalInput,
    map: mappingPath,
    outputDir: join(temporaryRoot, "schema-output"),
    ...options({ fixture: false }),
  }));

  const invalidEncodingInput = join(temporaryRoot, "invalid-encoding.csv");
  await writeFile(invalidEncodingInput, Buffer.from([0xff, 0xfe, 0x2c, 0x0a]));
  await expectError("privacy", "non-UTF-8 source bytes are rejected instead of corrupting guest text", "INPUT_ENCODING_NOT_UTF8", () => convertReservationFile({
    input: invalidEncodingInput,
    map: mappingPath,
    outputDir: join(temporaryRoot, "invalid-encoding-output"),
    ...options({ fixture: false }),
  }));

  const cancelled = sourceText.replace(/^Confirmed,/m, "Cancelled,");
  const cancelledResult = convertReservationData({ sourceText: cancelled, mappingConfig, options: options() });
  record("scope", "cancelled reservation fails closed", cancelledResult.report.issues.some((issue) => issue.code === "UNEXPECTED_STATUS"));

  const unmapped = sourceText.replace("Prospect Two Bedroom", "Unknown Room Name");
  const unmappedResult = convertReservationData({ sourceText: unmapped, mappingConfig, options: options() });
  record("mapping", "unknown room fails closed", unmappedResult.report.issues.some((issue) => issue.code === "ROOM_UNMAPPED"));

  const blankProperty = `${dataLines[0]}\n${dataLines[1].replace(",Prospect,", ",,")}\n`;
  const blankPropertyResult = convertReservationData({ sourceText: blankProperty, mappingConfig, options: options() });
  record("mapping", "blank property cannot be silently inferred from the room name", blankPropertyResult.report.issues.some((issue) => issue.code === "PROPERTY_EMPTY" && issue.field === "property"));

  const contradictoryProperty = `${dataLines[0]}\n${dataLines[1].replace(",Prospect,", ",Providence,")}\n`;
  const contradictoryPropertyResult = convertReservationData({ sourceText: contradictoryProperty, mappingConfig, options: options({ propertyHint: "prospect" }) });
  record("mapping", "property hint cannot override a contradictory source property", contradictoryPropertyResult.report.issues.some((issue) => issue.code === "PROPERTY_HINT_CONFLICT" && issue.field === "property"));

  const malformedQuotes = sourceText.replace("Alice Example", "Alice \"Example\"");
  await expectError("parsing", "unescaped CSV quotes fail closed", "CSV_UNEXPECTED_QUOTE", () => convertReservationData({
    sourceText: malformedQuotes,
    mappingConfig,
    options: options({ delimiter: "," }),
  }));

  const ambiguousDates = convertReservationData({ sourceText, mappingConfig, options: options({ dateOrder: undefined }) });
  record("dates", "non-ISO source dates require explicit date order", ambiguousDates.report.issues.some((issue) => issue.code === "CHECK_IN_DATE_INVALID_OR_AMBIGUOUS"));

  const timestampDate = sourceText.replace("01/10/2026", "2026-10-01T15:00:00Z");
  const timestampResult = convertReservationData({ sourceText: timestampDate, mappingConfig, options: options() });
  record("dates", "timestamp input fails until timezone handling is explicitly reviewed", timestampResult.report.issues.some((issue) => issue.code === "CHECK_IN_DATE_INVALID_OR_AMBIGUOUS"));

  const decimalCommaAmount = sourceText.replace("620.00", "\"155,50\"");
  const decimalCommaResult = convertReservationData({ sourceText: decimalCommaAmount, mappingConfig, options: options() });
  record("amounts", "decimal-comma amount is rejected instead of being inflated", decimalCommaResult.report.issues.some((issue) => issue.code === "TOTAL_AMOUNT_INVALID"));

  const multiRoomSource = `${dataLines[0]},Number of Rooms\n${dataLines[1]},2\n`;
  const multiRoomResult = convertReservationData({ sourceText: multiRoomSource, mappingConfig, options: options() });
  record("inventory", "one-row multi-room booking is blocked until explicit expansion is supported", multiRoomResult.report.issues.some((issue) => issue.code === "MULTI_ROOM_ROW_NOT_SUPPORTED"));

  const duplicateSource = `${sourceText.trimEnd()}\n${dataLines[1]}\n`;
  const duplicateResult = convertReservationData({ sourceText: duplicateSource, mappingConfig, options: options() });
  record("duplicates", "duplicate reservation reference blocks conversion", duplicateResult.report.issues.some((issue) => issue.code === "DUPLICATE_REFERENCE"));

  const probableDuplicateLine = dataLines[1].replace("DEMO-001", "DEMO-901");
  const probableDuplicateSource = `${sourceText.trimEnd()}\n${probableDuplicateLine}\n`;
  const probableDuplicateResult = convertReservationData({ sourceText: probableDuplicateSource, mappingConfig, options: options() });
  record("duplicates", "same stay and contact under a new reference requires manual review", probableDuplicateResult.report.issues.some((issue) => issue.code === "PROBABLE_DUPLICATE"));

  const capacityHeader = dataLines[0];
  const capacityRows = Array.from({ length: 4 }, (_, index) => [
    "Confirmed", "Prospect", "Prospect Two Bedroom", `Fixture Guest ${index + 1}`,
    `fixture${index + 1}@example.invalid`, `+1 202 555 02${String(index + 1).padStart(2, "0")}`,
    "01/10/2026", "05/10/2026", "2", "0", "620.00", "USD", `CAPACITY-${index + 1}`, "Synthetic fixture only",
  ].join(","));
  const capacitySource = `${capacityHeader}\n${capacityRows.join("\n")}\n`;
  const capacityResult = convertReservationData({ sourceText: capacitySource, mappingConfig, options: options() });
  record("inventory", "overlapping reservations above configured inventory block conversion", capacityResult.report.issues.some((issue) => issue.code === "INVENTORY_CAPACITY_EXCEEDED"));

  const cliOutput = join(temporaryRoot, "cli-output");
  const cli = await execFileAsync(process.execPath, [
    converterPath,
    "--input", sourcePath,
    "--map", mappingPath,
    "--output-dir", cliOutput,
    "--as-of", "2026-09-19",
    "--date-order", "dmy",
    "--fixture",
  ], { cwd: root, windowsHide: true });
  const consoleText = `${cli.stdout}\n${cli.stderr}`;
  record("privacy", "CLI output contains no guest values or local file paths", fixtureSecrets.every((value) => !consoleText.includes(value)) && !consoleText.includes(root));

  const excludedRepositoryDirectories = new Set([
    ".git", "node_modules", "dist", ".private", "bestevillas new images", "Best evillas new images 2",
  ]);
  const csvLike = (await walk(root, excludedRepositoryDirectories))
    .filter((path) => [".csv", ".tsv", ".xls", ".xlsx"].includes(extname(path).toLowerCase()));
  const unexpected = csvLike.filter((path) => !allowedSyntheticCsv.has(resolve(path)));
  record("privacy", "only the exact allowlisted synthetic tabular fixtures exist in the repository tree", unexpected.length === 0, unexpected.length ? `${unexpected.length} unexpected tabular file(s)` : "");

  const fixtureContents = await Promise.all([...allowedSyntheticCsv].map((path) => readFile(path, "utf8")));
  record("privacy", "every allowlisted CSV carries synthetic-only markers", fixtureContents.every((value) => value.includes("example.invalid") && /DEMO-\d+/.test(value)));

  const tracked = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, windowsHide: true });
  const trackedFiles = tracked.stdout.split("\u0000").filter(Boolean).map((path) => path.replaceAll("\\", "/"));
  const allowedRelativeCsv = new Set([...allowedSyntheticCsv].map((path) => relative(root, path).replaceAll("\\", "/")));
  const trackedPrivate = trackedFiles.filter((path) => {
    const extension = extname(path).toLowerCase();
    const privateName = /(^|\/)\.private\//.test(path) || /\.private\.(csv|tsv|xls|xlsx|json)$/i.test(path);
    const unapprovedTable = [".csv", ".tsv", ".xls", ".xlsx"].includes(extension) && !allowedRelativeCsv.has(path);
    return privateName || unapprovedTable;
  });
  record("privacy", "Git index contains no forced private or unapproved tabular file", trackedPrivate.length === 0, trackedPrivate.length ? `${trackedPrivate.length} tracked private file(s)` : "");

  const distFiles = await walk(resolve(root, "dist"), new Set([".private", "node_modules", ".git"]));
  const distTables = distFiles.filter((path) => [".csv", ".tsv", ".xls", ".xlsx"].includes(extname(path).toLowerCase()));
  record("privacy", "public Pages artifact contains no tabular reservation file", distTables.length === 0, distTables.length ? `${distTables.length} public tabular file(s)` : "");
  const textExtensions = new Set([".html", ".js", ".json", ".xml", ".txt", ".csv", ".tsv"]);
  const reservationHeader = INNBOSS_COLUMNS.join(",");
  let distSignatureCount = 0;
  for (const path of distFiles.filter((file) => textExtensions.has(extname(file).toLowerCase()))) {
    if ((await readFile(path, "utf8")).includes(reservationHeader)) distSignatureCount += 1;
  }
  record("privacy", "public Pages artifact contains no reservation CSV signature", distSignatureCount === 0, distSignatureCount ? `${distSignatureCount} matching public file(s)` : "");
} catch (error) {
  record("runtime", "audit completes without uncaught error", false, error.code || error.message);
} finally {
  if (temporaryRoot) {
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
      record("cleanup", "temporary private conversion files removed", true);
    } catch (error) {
      record("cleanup", "temporary private conversion files removed", false, error.code || "cleanup failed");
    }
  }
}

const failed = results.filter((result) => !result.passed);
const finalReport = {
  generatedAt: new Date().toISOString(),
  passed: results.length - failed.length,
  total: results.length,
  failed,
  results,
};
await writeFile(evidencePath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ passed: finalReport.passed, total: finalReport.total, failed }, null, 2));
if (failed.length) process.exitCode = 1;
