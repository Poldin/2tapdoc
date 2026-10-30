import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkChar,
  computeCodiceFiscale,
  encodeCognome,
  encodeNome,
  executeCalcolaCodiceFiscale,
  resolveCodiceCatastale,
} from "../lib/codice-fiscale.ts";

describe("codice fiscale encoding", () => {
  it("encodes surname with consonants then vowels and X padding", () => {
    assert.equal(encodeCognome("Rossi"), "RSS");
    assert.equal(encodeCognome("Fo"), "FOX");
    assert.equal(encodeCognome("Ae"), "AEX");
  });

  it("encodes name taking 1st/3rd/4th consonant when 4+", () => {
    assert.equal(encodeNome("Mario"), "MRA");
    // GIANFRANCO → consonants GNFRNC… → G, F, R
    assert.equal(encodeNome("Gianfranco"), "GFR");
    assert.equal(encodeNome("Li"), "LIX");
  });

  it("computes Mario Rossi M 1985-03-15 Roma → RSSMRA85C15H501R (check digit via official tables)", () => {
    const result = computeCodiceFiscale({
      cognome: "Rossi",
      nome: "Mario",
      sesso: "M",
      dataNascita: "1985-03-15",
      luogoNascita: "Roma",
    });
    assert.equal(result.codiceCatastale, "H501");
    assert.equal(result.codice, "RSSMRA85C15H501R");
    assert.equal(result.codice.length, 16);
    assert.equal(checkChar(result.codice.slice(0, 15)), result.codice[15]);
  });

  it("matches Wikipedia example Rossi Mario M 1980-01-01 Roma → RSSMRA80A01H501U", () => {
    const result = computeCodiceFiscale({
      cognome: "Rossi",
      nome: "Mario",
      sesso: "M",
      dataNascita: "1980-01-01",
      luogoNascita: "Roma",
    });
    assert.equal(result.codice, "RSSMRA80A01H501U");
  });

  it("adds 40 to day for female and accepts DD/MM/YYYY", () => {
    const result = computeCodiceFiscale({
      cognome: "Rossi",
      nome: "Maria",
      sesso: "F",
      dataNascita: "15/03/1985",
      luogoNascita: "Roma",
    });
    assert.equal(result.codice.slice(0, 6), "RSSMRA");
    assert.equal(result.codice.slice(6, 11), "85C55");
    assert.equal(result.codiceCatastale, "H501");
    assert.equal(result.codice.length, 16);
  });

  it("resolves Milano and foreign Francia cadastral codes", () => {
    assert.equal(resolveCodiceCatastale("Milano").code, "F205");
    assert.equal(resolveCodiceCatastale("Francia").code, "Z110");
    assert.equal(resolveCodiceCatastale("H501").code, "H501");
  });

  it("tool executor returns ok for full args and error when missing", () => {
    const ok = executeCalcolaCodiceFiscale({
      cognome: "Rossi",
      nome: "Mario",
      sesso: "M",
      data_nascita: "1985-03-15",
      luogo_nascita: "Roma",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.codice, "RSSMRA85C15H501R");

    const bad = executeCalcolaCodiceFiscale({ cognome: "Rossi" });
    assert.equal(bad.ok, false);
  });
});