import * as VPN from 'vpnrpc/dist/vpnrpc';

// Capability lookups over the GetCaps CapsList, mirroring GetCapsInt and
// GetCapsBool in the server source (Cedar/Server.c): a capability missing
// from the list reads as 0 / false. Gates therefore fail closed when the
// server does not advertise a capability, including when the GetCaps probe
// failed and the list is empty.

export const capValue = (capsList: unknown[], name: string): number => {
  const cap = capsList.find((item) => (item as VPN.VpnCaps).CapsName_str === name) as VPN.VpnCaps | undefined;
  return cap ? cap.CapsValue_u32 : 0;
};

export const capBool = (capsList: unknown[], name: string): boolean => capValue(capsList, name) !== 0;
