// Test fixture: a password-protected PKCS #12 archive containing one
// self-signed certificate and its RSA private key.
export const PKCS12_PASSWORD = "archive-password";

export const PKCS12_ARCHIVE_B64 =
  "MIIDywIBAzCCA5EGCSqGSIb3DQEHAaCCA4IEggN+MIIDejCCAZkGCSqGSIb3DQEH" +
  "AaCCAYoEggGGMIIBgjCCAX4GCyqGSIb3DQEMCgEDoIIBRjCCAUIGCiqGSIb3DQEJ" +
  "FgGgggEyBIIBLjCCASowgdWgAwIBAgIBATANBgkqhkiG9w0BAQsFADAeMRwwGgYD" +
  "VQQDExNmaXh0dXJlLmV4YW1wbGUuY29tMB4XDTI2MDEwMTAwMDAwMFoXDTI3MDEw" +
  "MTAwMDAwMFowHjEcMBoGA1UEAxMTZml4dHVyZS5leGFtcGxlLmNvbTBcMA0GCSqG" +
  "SIb3DQEBAQUAA0sAMEgCQQC7JRH5XayYbqSoHnJzeOkHD/DkJPMDnsuCMRgUKP5h" +
  "3bcz9L3rY2tpS4SKU+KKvU7JRxpljtvwOP4NQcIjL2+lAgMBAAEwDQYJKoZIhvcN" +
  "AQELBQADQQA75nOBhSpOla4mP2Wfp1Aqq6l8+bnwlDYKjxFI5vlea1rPZMr73wwE" +
  "jVlzu1Slgos4HNluod4M2r80bK7eyd6BMSUwIwYJKoZIhvcNAQkVMRYEFJP8cdkX" +
  "jzXcVZ98WBGrt9P5+z4mMIIB2QYJKoZIhvcNAQcBoIIBygSCAcYwggHCMIIBvgYL" +
  "KoZIhvcNAQwKAQKgggGGMIIBgjAcBgoqhkiG9w0BDAEDMA4ECJPB3XwkQyCcAgII" +
  "AASCAWD3cFLPpnNAeYQABvFZpgEpFLL7czLaDozLmuJES/Nv9DXM59PE7wOtuk0y" +
  "vPow9/W0yZ+dMp5yBwVUB7Z1ZscV5W/Bp9RxQcZJc7c4ljN9ajkWm8rXB+iQ4UH" +
  "EiU5iLFUQ9EU6BfBNRlJNoisrn51P6gpGpbMcHBSf47d+akuJFLaXjdJ4MRWmGL7" +
  "/RngNkDvt8NnqycUNAXj62qINrDJfKWex0FEIFDFPLNAlEiJkgu3+DG9FUf+RKf" +
  "0y/NranssoRhsKm/Ng+0Z5VA3ZSdOG0dHzyedEdLdUzq4za8boHZfprdaURSLVqh" +
  "p7syrotYs5VQwo6iXIEjg9bvhSPJs8E26KMV5tbpuLiNQ30IGy5rDvgILBylQiPa" +
  "oFccm7q7QZp3xcUHActFL4+dyzu3e0yySDlgIB/IL8ym5Wa87DeokdcIz+DJWRJd" +
  "wDOZneZzAAgkIHLxMQG3HWU3CG8ZOWMSUwIwYJKoZIhvcNAQkVMRYEFJP8cdkXjz" +
  "XcVZ98WBGrt9P5+z4mMDEwITAJBgUrDgMCGgUABBTJf7e0+S2rvgceFLiLUUElj2" +
  "do7gQIj8Lv4nd9Io8CAggA";

const bytesFromBase64 = (base64: string): Uint8Array =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

export const PKCS12_ARCHIVE = (): Uint8Array => bytesFromBase64(PKCS12_ARCHIVE_B64);
