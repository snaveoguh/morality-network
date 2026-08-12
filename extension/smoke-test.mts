// One-off smoke test for wallet-core + legacy migration (run via esbuild bundle).
import {
  generateMnemonic, validateMnemonic, deriveEvmAccount,
  encryptMnemonic, decryptMnemonic, PBKDF2_ITERATIONS, DERIVATION_PATH,
} from './src/shared/wallet-core';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

// 1. Known BIP-39 vector: the classic "test test … junk" phrase.
const KNOWN = 'test test test test test test test test test test test junk';
const KNOWN_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // hardhat/foundry account 0 (m/44'/60'/0'/0/0)
check('validateMnemonic accepts known phrase', validateMnemonic(KNOWN));
check('validateMnemonic rejects garbage', !validateMnemonic('not a real phrase at all one two three four five six'));
const derived = deriveEvmAccount(KNOWN);
check(`deriveEvmAccount ${DERIVATION_PATH} matches known address`, derived.address === KNOWN_ADDR, derived.address);

// 2. Generate → derive → encrypt → decrypt roundtrip.
const phrase = generateMnemonic();
check('generateMnemonic yields 12 words', phrase.split(' ').length === 12, phrase.split(' ').length + ' words');
check('generated phrase validates', validateMnemonic(phrase));
const acct = deriveEvmAccount(phrase);
const enc = await encryptMnemonic(phrase, 'hunter22');
check('payload shape {v:1,salt,iv,ct}', enc.v === 1 && !!enc.salt && !!enc.iv && !!enc.ct);
check('salt is 16 bytes', atob(enc.salt).length === 16);
check('iv is 12 bytes', atob(enc.iv).length === 12);
check('iterations >= 310000', PBKDF2_ITERATIONS >= 310_000, String(PBKDF2_ITERATIONS));
const dec = await decryptMnemonic(enc, 'hunter22');
check('decrypt roundtrip', dec === phrase);
check('re-derived address stable', deriveEvmAccount(dec).address === acct.address);
let wrongPwThrew = false;
try { await decryptMnemonic(enc, 'wrong'); } catch { wrongPwThrew = true; }
check('wrong password throws', wrongPwThrew);

// 3. Legacy blob (0.1.0 format: hex fields, 100k iterations) decrypts.
async function legacyEncrypt(data: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data));
  const hex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return { iv: hex(iv), salt: hex(salt), ciphertext: hex(new Uint8Array(ct)) };
}
// Reproduce wallet.ts's legacy path inline (chrome.storage isn't available here).
const legacyKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const legacyBlob = await legacyEncrypt(legacyKey, 'oldpass');
{
  const hexToBuf = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return bytes;
  };
  const iv = hexToBuf(legacyBlob.iv), salt = hexToBuf(legacyBlob.salt), ct = hexToBuf(legacyBlob.ciphertext);
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode('oldpass'), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const out = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, ct.buffer as ArrayBuffer));
  check('legacy blob decrypts to original key', out === legacyKey);
  // and the migrated re-encryption via wallet-core roundtrips:
  const migrated = await encryptMnemonic(out, 'oldpass');
  check('migrated v2 payload roundtrips', (await decryptMnemonic(migrated, 'oldpass')) === legacyKey);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
