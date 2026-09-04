import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseClientCsv } from "@/lib/csv";

test("parses quoted fields with embedded commas and quotes", () => {
  const rows = parseCsv('a,b,c\n"hello, world","say ""hi""",3\n');
  assert.deepEqual(rows[0], ["a", "b", "c"]);
  assert.deepEqual(rows[1], ["hello, world", 'say "hi"', "3"]);
});

test("handles CRLF and skips blank lines", () => {
  const rows = parseCsv("x,y\r\n1,2\r\n\r\n3,4\r\n");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[2], ["3", "4"]);
});

test("maps header aliases and typed rooms", () => {
  const csv = [
    "Full Name,Email Address,Mobile,Post Code,Bedrooms,Bathrooms,Kitchens",
    "Jane Doe,jane@example.com,07123,SW4 7AA,2,1,1",
  ].join("\n");
  const { records, errors } = parseClientCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Jane Doe");
  assert.equal(records[0].email, "jane@example.com");
  assert.equal(records[0].phone, "07123");
  assert.equal(records[0].postcode, "SW4 7AA");
  assert.deepEqual(records[0].rooms, { kitchens: 1, bathrooms: 1, receptions: 0, bedrooms: 2 });
});

test("collects errors for missing/invalid rows without dropping valid ones", () => {
  const csv = [
    "name,email",
    "No Email,",
    "Bad Email,not-an-email",
    "Good One,good@example.com",
  ].join("\n");
  const { records, errors } = parseClientCsv(csv);
  assert.equal(records.length, 1);
  assert.equal(records[0].email, "good@example.com");
  assert.equal(errors.length, 2);
  assert.equal(errors[0].row, 2);
});

test("empty input yields no records", () => {
  const { records, errors } = parseClientCsv("");
  assert.equal(records.length, 0);
  assert.equal(errors.length, 0);
});
