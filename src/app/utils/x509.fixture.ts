// Test fixture: a self-signed certificate with
// CN=test.example.com, O=TestOrg, OU=TestUnit, C=US (valid 2026-2036).
// Only imported by tests, so it is not part of the application bundle.
export const SELF_SIGNED_CERT_B64 =
  'MIIDezCCAmOgAwIBAgIURQSaxZ1P7LAXEWiDHonqqzra0K0wDQYJKoZIhvcNAQEL' +
  'BQAwTTEZMBcGA1UEAwwQdGVzdC5leGFtcGxlLmNvbTEQMA4GA1UECgwHVGVzdE9y' +
  'ZzERMA8GA1UECwwIVGVzdFVuaXQxCzAJBgNVBAYTAlVTMB4XDTI2MDcwNDEzMjQz' +
  'MFoXDTM2MDcwMTEzMjQzMFowTTEZMBcGA1UEAwwQdGVzdC5leGFtcGxlLmNvbTEQ' +
  'MA4GA1UECgwHVGVzdE9yZzERMA8GA1UECwwIVGVzdFVuaXQxCzAJBgNVBAYTAlVT' +
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoxSYIXHxHgw1fiHqP4hL' +
  'kwHTf/J7adGi0JYnalnEytt6TYd6CxnHTh5O5dBt5/6Lvv0q2e23d9/pnSMYJ1Ui' +
  'iPQMMbsGRnj3JzSeRkrCsH7q+MLl2TEqG0lDR2/FTSE4HKqbowncYadmGTYNs2+Y' +
  'NK2jntPXXYRGUdc/Io0+6aWowobXZFn51KnaYA9Udj61f28HEBy1FUjCAY3cqzIh' +
  '+KWjNSvYXDWJ17wJTphBrFS0xR6Q7bNr4swR0YOuZlGfh/HSDKjK5Pl4QZGOIZx+' +
  'Eiw+1uihC1ebZ2k4ZhnloIPgo+LfH2ACigWn6kiWAW3KjsaJHVgK3IYfj2pmCzvH' +
  'AwIDAQABo1MwUTAdBgNVHQ4EFgQUkt1T2SGHiT0a7GFOte1OePKdPc4wHwYDVR0j' +
  'BBgwFoAUkt1T2SGHiT0a7GFOte1OePKdPc4wDwYDVR0TAQH/BAUwAwEB/zANBgkq' +
  'hkiG9w0BAQsFAAOCAQEAIGwwQo0vKyH4OvZtF21X1yYBgoUnzSLinqQQKCgy8KY8' +
  'VgFPD2sCMSsdz/wG/9YMvZ/JT7j0Ndgo+Vy2V1kRHu/UEbK6XxrZ7fK68gCTJCjZ' +
  'BAP+8+DOar24I0UCVR22zGYx/KOEiFs2qIVeSXMm68aq70bj6+PMD2tmfmR/eY82' +
  'GOgiGSyr6Cj4//OZGYaVwTSnNZ+6PxxoNqp8Ny8ByURKNmi7yjyNQRzBMvvx8I26' +
  'jgZqOe6a7c2Lc8cDPtfw80d15jPTd9a/qdtjGqLZdQfR80mMkR44ory0aZuSlMgq' +
  'ISUWsjrzmFJuNlmx0qj2nvu31rnhK8ajiAuUyJl5ew==';

export const derFromBase64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const SELF_SIGNED_CERT_DER = (): Uint8Array => derFromBase64(SELF_SIGNED_CERT_B64);
