import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  signedRequestUrl,
  twilioSignature,
  twilioSignatureBase,
  verifyTwilioSignature,
} from "@/lib/twilio-signature";

/**
 * The vector is Twilio's own published example (auth token `12345`, the
 * `myapp.php` URL and that parameter set), not one this implementation
 * generated — a self-generated vector would only prove the code agrees with
 * itself. It is the whole value of this test: if the concatenation order, the
 * encoding or the digest were wrong, the string below would not come out.
 */
const EXAMPLE = {
  url: "https://mycompany.com/myapp.php?foo=1&bar=2",
  token: "12345",
  params: {
    CallSid: "CA1234567890ABCDE",
    Caller: "+14158675309",
    Digits: "1234",
    From: "+14158675309",
    To: "+18005551212",
  },
  signature: "RSOYDt4T1cUTdK1PDd93/VVr8B8=",
};

describe("Twilio request signatures", () => {
  test("matches Twilio's published example", () => {
    assert.equal(twilioSignature(EXAMPLE.token, EXAMPLE.url, EXAMPLE.params), EXAMPLE.signature);
  });

  test("accepts the genuine signature", () => {
    assert.equal(
      verifyTwilioSignature({
        signature: EXAMPLE.signature,
        authToken: EXAMPLE.token,
        url: EXAMPLE.url,
        params: EXAMPLE.params,
      }),
      true,
    );
  });

  test("parameters are sorted by name, and joined with nothing", () => {
    // Insertion order must not matter: Twilio sends form fields in whatever
    // order it likes.
    const a = twilioSignatureBase("u", { b: "2", a: "1" });
    const b = twilioSignatureBase("u", { a: "1", b: "2" });
    assert.equal(a, b);
    assert.equal(a, "ua1b2");
  });

  test("a tampered parameter fails", () => {
    const params = { ...EXAMPLE.params, From: "+447700900000" };
    assert.equal(
      verifyTwilioSignature({
        signature: EXAMPLE.signature,
        authToken: EXAMPLE.token,
        url: EXAMPLE.url,
        params,
      }),
      false,
    );
  });

  test("an added parameter fails", () => {
    assert.equal(
      verifyTwilioSignature({
        signature: EXAMPLE.signature,
        authToken: EXAMPLE.token,
        url: EXAMPLE.url,
        params: { ...EXAMPLE.params, Body: "STOP" },
      }),
      false,
    );
  });

  test("a different URL fails — the URL is part of what is signed", () => {
    assert.equal(
      verifyTwilioSignature({
        signature: EXAMPLE.signature,
        authToken: EXAMPLE.token,
        url: "https://mycompany.com/myapp.php",
        params: EXAMPLE.params,
      }),
      false,
    );
  });

  test("a missing or empty signature fails, and an empty token never passes", () => {
    // The L5 lesson: `timingSafeEqual(empty, empty)` is TRUE. A blank header or
    // a blank token must be a refusal, not an accidental pass.
    for (const signature of [null, undefined, ""]) {
      assert.equal(
        verifyTwilioSignature({ signature, authToken: EXAMPLE.token, url: EXAMPLE.url, params: {} }),
        false,
      );
    }
    assert.equal(
      verifyTwilioSignature({ signature: "", authToken: "", url: "u", params: {} }),
      false,
      "an empty signature against an empty token is still a refusal",
    );
  });

  test("the signed URL follows the proxy headers, and an override wins", () => {
    const request = new Request("http://10.0.0.1:3000/api/sms/inbound", {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "www.example.com" },
    });
    assert.equal(
      signedRequestUrl(request, {} as unknown as NodeJS.ProcessEnv),
      "https://www.example.com/api/sms/inbound",
    );
    assert.equal(
      signedRequestUrl(request, { TWILIO_WEBHOOK_URL: "https://set.example/x" } as unknown as NodeJS.ProcessEnv),
      "https://set.example/x",
    );
  });
});
