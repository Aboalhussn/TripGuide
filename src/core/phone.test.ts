import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPhoneInput, countryOptions, formatPhone, loginPhone, parsePhone, searchCountries, serverPhone, splitPhone } from './phone';
import { ApiError } from './util';

const e164 = (input: string, country?: any) => {
  const r = parsePhone(input, country);
  return r.ok ? r.e164 : r.error;
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiError ? e.code : String(e);
  }
  return 'ok';
};

test('phone: Iraqi numbers are normalised to E.164', () => {
  assert.equal(e164('07713111325', 'IQ'), '+9647713111325', 'the leading national 0 is dropped');
  assert.equal(e164('7713111325', 'IQ'), '+9647713111325');
  assert.equal(e164('0771 311 1325', 'IQ'), '+9647713111325', 'spaces');
  assert.equal(e164('0771-311-1325', 'IQ'), '+9647713111325', 'dashes');
  assert.equal(e164('٠٧٧١٣١١١٣٢٥', 'IQ'), '+9647713111325', 'Arabic-Indic digits');
  assert.equal(e164('۰۷۷۱۳۱۱۱۳۲۵', 'IQ'), '+9647713111325', 'Persian digits');
});

test('phone: a pasted +number carries its own country, whatever the picker says', () => {
  const r = parsePhone('+44 7400 123456', 'IQ');
  assert.ok(r.ok);
  assert.equal(r.ok && r.country, 'GB');
  assert.equal(r.ok && r.e164, '+447400123456');
  assert.equal(e164('00964 771 311 1325', 'DE'), '+9647713111325', '00 works like +');
  assert.equal(cleanPhoneInput(' +964 (771) 311-1325 '), '+9647713111325');
});

test('phone: validated per country', () => {
  assert.equal(e164('01512 3456789', 'DE'), '+4915123456789');
  assert.equal(e164('06 12 34 56 78', 'FR'), '+33612345678');
  assert.equal(e164('(415) 555-2671', 'US'), '+14155552671', 'the US cannot tell mobile from landline: accepted');
  assert.equal(e164('0300 1234567', 'PK'), '+923001234567');
  assert.equal(e164('090-1234-5678', 'JP'), '+819012345678');
  assert.equal(e164('07713111325', 'DE'), 'phone_invalid', 'an Iraqi number is not a German one');
  assert.equal(e164('12345', 'IQ'), 'phone_invalid', 'too short');
  assert.equal(e164('07713111325999', 'IQ'), 'phone_invalid', 'too long');
  assert.equal(e164('01 234 5678', 'IQ'), 'phone_invalid', 'a Baghdad landline is not a mobile');
  assert.equal(e164('', 'IQ'), 'phone_invalid');
});

test('phone: a country code is required', () => {
  assert.equal(e164('07713111325'), 'country_code_required');
  assert.equal(e164('07713111325', null), 'country_code_required');
  assert.equal(code(() => serverPhone('07713111325')), 'country_code_required', 'the API takes the full number only');
  assert.equal(code(() => serverPhone(undefined)), 'field_required');
  assert.equal(code(() => serverPhone('')), 'field_required');
  assert.equal(code(() => serverPhone('+964123')), 'phone_invalid');
  assert.equal(serverPhone('+964 771 311 1325'), '+9647713111325');
  assert.equal(serverPhone('+٩٦٤٧٧١٣١١١٣٢٥'), '+9647713111325');
});

test('phone: sign-in matches nobody for an unreadable number; a stored number splits back for the form', () => {
  assert.equal(loginPhone('+9647713111325'), '+9647713111325');
  assert.equal(loginPhone('hello'), null);
  assert.equal(loginPhone(undefined), null);
  assert.deepEqual(splitPhone('+9647713111325'), { country: 'IQ', national: '7713111325' });
  assert.deepEqual(splitPhone('+447400123456'), { country: 'GB', national: '7400123456' });
});

test('phone: the country list is searchable by English name, Arabic name and dial code', () => {
  const all = countryOptions();
  assert.ok(all.length > 200, 'all countries');
  const iq = all.find((c) => c.code === 'IQ')!;
  assert.equal(iq.dial, '+964');
  assert.equal(iq.name, 'Iraq');
  assert.equal(searchCountries('iraq')[0].code, 'IQ');
  assert.ok(searchCountries('العراق').some((c) => c.code === 'IQ'), 'Arabic name');
  assert.deepEqual(searchCountries('+964').map((c) => c.code), ['IQ']);
  assert.deepEqual(searchCountries('٩٦٤').map((c) => c.code), ['IQ'], 'Arabic-Indic dial code');
  assert.ok(searchCountries('49').some((c) => c.code === 'DE'));
  assert.equal(searchCountries('zzzz').length, 0);
});

test('phone: a stored number is shown with spaces, the way people read it', () => {
  assert.equal(formatPhone('+9647700001004'), '+964 770 000 1004');
  assert.equal(formatPhone('+447400123456'), '+44 7400 123456');
  assert.equal(formatPhone('not a number'), 'not a number');
});
