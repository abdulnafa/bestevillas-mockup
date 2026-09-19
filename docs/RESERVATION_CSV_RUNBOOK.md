# Reservation CSV staging runbook

## Status and purpose

This is an offline, fail-closed preparation tool for the planned one-time SiteMinder/Little Hotelier to InnBoss reservation migration. It validates a private source export, maps exact property and room names, and writes one InnBoss-shaped CSV per property.

It does **not** log in to either platform, call a network service, change availability, import reservations, publish a property, or alter rates. The example InnBoss schema is deliberately marked unverified, so real conversion remains blocked until the current InnBoss example CSV has been downloaded and checked privately.

## Data-safety rules

- Never place a real guest export, converted file, screenshot, or validation copy in the public repository.
- Keep real working files outside the repository or in `.private/reservations/`, which Git ignores.
- Do not paste guest rows into project documentation, issues, commit messages, terminal transcripts, or chat.
- Preserve the original export unchanged. Work from a copy and keep access limited to authorized project personnel.
- The converter prints only aggregate counts and redacted row/field error codes. It refuses to overwrite an existing output.
- The converter never uploads or imports anything. InnBoss import remains a separate, manually reviewed action.

## Required inputs before a real run

1. A private SiteMinder/Little Hotelier export containing only confirmed/upcoming reservations and any currently checked-in active stays. Past, cancelled, checked-out, no-show, and pending records are outside the approved scope.
2. The current InnBoss example CSV downloaded privately from **Front Desk → Forwarded bookings → Import the bookings you already have**.
3. Confirmation of the source date order (`dmy`, `mdy`, or `ymd`) and that all totals are USD.
4. A reviewed private copy of `scripts/reservations/room-map.example.json`. Its target columns and date format must match the current InnBoss example exactly before `innboss_schema.verified` is changed to `true`.

## Confirmed room mapping

| InnBoss property | Exact InnBoss room type | Sellable units |
| --- | --- | ---: |
| Prospect | Two Bedroom Apartment | 3 |
| Prospect | Three Bedroom Apartment | 2 |
| Providence | Providence Two Bedroom Apartment | 4 |
| St. Silas | Three Bedroom Unit | 2 |

The converter accepts only explicitly listed source aliases. It never guesses or fuzzy-matches an unknown room/property name.

## Safe workflow

1. Download the original SiteMinder/Little Hotelier CSV into a private location.
2. Download the current InnBoss example CSV and compare its column names and date expectations with `innboss_schema` in the example mapping.
3. Copy the mapping into the ignored private folder, update aliases only from the reviewed source export, and set `innboss_schema.verified` to `true` only after its exact columns, comma delimiter, and `YYYY-MM-DD` date format match the current InnBoss example. If InnBoss expects another format, stop and update/test the tool rather than changing the flag.
4. Use a new, empty output directory for every attempt. Example PowerShell preparation:

   ```powershell
   New-Item -ItemType Directory -Force -Path ".private/reservations" | Out-Null
   Copy-Item "scripts/reservations/room-map.example.json" ".private/reservations/room-map.private.json"
   ```

5. Run the local converter, replacing the date with the export/import cutoff date and choosing the source's confirmed date order:

   ```powershell
   npm.cmd run reservations:convert -- --input ".private/reservations/siteminder.private.csv" --map ".private/reservations/room-map.private.json" --output-dir ".private/reservations/review-2026-09-19" --as-of 2026-09-19 --date-order dmy --default-currency USD
   ```

6. If validation passes, review the aggregate JSON report and privately compare every generated row against the unchanged source export. Confirm property, room, arrival/departure, adults/children, total, currency, and reference.
7. Check source and output record counts, duplicates, active-stay handling, and peak inventory for each room type. Resolve every discrepancy in the source/mapping and generate a fresh output directory; never edit around a blocking error.
8. Only after a second authorized review should each property CSV be considered for the corresponding private InnBoss profile. Take a private backup/export first and verify the platform's preview before confirming an import.

## Fail-closed checks

Conversion is blocked for, among other cases:

- missing or ambiguous required headers;
- non-UTF-8 source data that could corrupt accented guest text;
- unverified InnBoss target schema;
- ambiguous or invalid dates, or checkout not after check-in;
- unknown, cancelled, past, checked-out, no-show, or otherwise out-of-scope reservations;
- non-USD or malformed totals;
- invalid guest/contact/reference values or spreadsheet-formula payloads;
- unmapped or ambiguous property/room names;
- duplicate/conflicting references or probable duplicate stays;
- overlapping bookings above confirmed sellable inventory;
- a detected room-quantity field whose value is not exactly one, because one-row multi-room expansion is not supported;
- an input/output location inside the public repository but outside `.private/reservations/`;
- any attempt to overwrite an existing generated file.

## Synthetic self-test

Run:

```powershell
npm.cmd run test:reservations
```

The test uses only four exactly allowlisted fictional CSV files under `testing/fixtures/reservations/`. It checks RFC 4180 quoting/multiline parsing, fatal UTF-8 handling, exact three-property output, redacted reporting, real-path/junction protection, schema gating, status/date/mapping/duplicate/inventory failures, one-row multi-room rejection, overwrite refusal, safe console output, the Git index, and the generated public Pages artifact.

## Known boundaries

- Final guest occupancy limits are not yet confirmed, so the tool validates adult/child number formats but does not enforce maximum occupancy.
- Seasonal rates and their date boundaries are separate configuration work; the converter does not calculate or change rates.
- The tool does not resolve a one-row multi-room booking into separate reservations. Recognized room-quantity columns are blocked unless the value is exactly one; the source must provide one unambiguous room row per reservation.
- Any unexpected SiteMinder export structure or changed InnBoss example format requires a mapping/tool review before use.
