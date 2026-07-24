const bytesToBinary = (bytes: Uint8Array): string => {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    let chunk = "";
    for (let index = offset; index < Math.min(offset + 8192, bytes.length); index += 1) {
      chunk += String.fromCharCode(bytes[index]);
    }
    chunks.push(chunk);
  }
  return chunks.join("");
};

const pemToBytes = (pem: string): Uint8Array => {
  const bytes = new Uint8Array(pem.length);
  for (let index = 0; index < pem.length; index += 1) {
    bytes[index] = pem.charCodeAt(index);
  }
  return bytes;
};

const binaryToBytes = (binary: string): Uint8Array => {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export interface Pkcs12KeyPair {
  certificate: Uint8Array;
  privateKey: Uint8Array;
}

export const isPkcs12File = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".p12") ||
    name.endsWith(".pfx") ||
    file.type === "application/x-pkcs12" ||
    file.type === "application/pkcs12"
  );
};

export const extractPkcs12KeyPair = async (
  bytes: Uint8Array,
  password: string,
): Promise<Pkcs12KeyPair> => {
  const forge = (await import("node-forge")).default;
  let pfx: ReturnType<typeof forge.pkcs12.pkcs12FromAsn1>;

  try {
    const asn1 = forge.asn1.fromDer(bytesToBinary(bytes));
    pfx = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch {
    throw new Error("Could not open the PKCS #12 archive. Check the file and password.");
  }

  const bags = (bagType: string) => pfx.getBags({ bagType })[bagType] ?? [];
  const keyBags = [
    ...bags(forge.pki.oids.pkcs8ShroudedKeyBag),
    ...bags(forge.pki.oids.keyBag),
  ].filter((bag) => bag.key !== undefined);

  if (keyBags.length !== 1) {
    throw new Error("The PKCS #12 archive must contain exactly one private key.");
  }

  const keyBag = keyBags[0];
  const localKeyId = keyBag.attributes?.localKeyId?.[0] as string | undefined;
  const certBags = bags(forge.pki.oids.certBag).filter((bag) => bag.cert !== undefined);
  const certBag = localKeyId
    ? certBags.find((bag) => bag.attributes?.localKeyId?.includes(localKeyId))
    : certBags.length === 1
      ? certBags[0]
      : undefined;

  if (!certBag?.cert) {
    throw new Error(
      "The PKCS #12 archive does not contain a certificate matching its private key.",
    );
  }

  return {
    certificate: pemToBytes(forge.pki.certificateToPem(certBag.cert)),
    privateKey: binaryToBytes(forge.asn1.toDer(forge.pki.privateKeyToAsn1(keyBag.key!)).getBytes()),
  };
};
