import * as React from 'react';
import { api } from '@app/utils/vpnrpc_settings';

const adminErrorString = 'Error: Code=52, Message=Error code 52: Not enough privileges.';

export interface ServerState {
  loading: boolean;
  user: string;
  ddnsHostname: string;
  ddnsProxy: boolean;
  azure: boolean;
  capsList: unknown[];
  /** Raw response of GetServerInfo */
  info: Record<string, unknown>;
  isTapSupported: boolean;
  isBridgeMode: boolean;
  isV4: boolean;
  isIpsecCapable: boolean;
  isOpenVPNSupported: boolean;
  isSSTPSupported: boolean;
  /** Hide routes flagged isAdmin (current user is only a hub administrator) */
  hideAdminOnly: boolean;
  /** Hide routes flagged isCluster: false (server is part of a cluster) */
  hideNonCluster: boolean;
  /** Hide routes flagged isBridge: false (server runs in bridge mode) */
  hideNonBridge: boolean;
  /** Nav labels hidden because the server lacks the capability */
  hiddenLabels: Set<string>;
}

const initialState: ServerState = {
  loading: true,
  user: 'Unknown',
  ddnsHostname: '',
  ddnsProxy: false,
  azure: false,
  capsList: [],
  info: {},
  isTapSupported: false,
  isBridgeMode: false,
  isV4: false,
  isIpsecCapable: false,
  isOpenVPNSupported: false,
  isSSTPSupported: false,
  hideAdminOnly: false,
  hideNonCluster: false,
  hideNonBridge: false,
  hiddenLabels: new Set<string>(),
};

const ServerContext = React.createContext<ServerState>(initialState);

export const useServer = (): ServerState => React.useContext(ServerContext);

/**
 * Probes the VPN server on mount (admin level, cluster configuration,
 * DDNS/Azure status, capabilities and server info) and exposes the results,
 * plus the derived navigation visibility rules, to the whole app.
 */
export const ServerProvider: React.FunctionComponent<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<ServerState>(initialState);
  const pending = React.useRef(0);

  React.useEffect(() => {
    // Reset on every effect run: under React.StrictMode the effect fires
    // twice in development and the counter must not go negative.
    pending.current = 5;

    const merge = (partial: Partial<ServerState>) => {
      pending.current -= 1;
      const done = pending.current <= 0;
      setState((prev) => ({
        ...prev,
        ...partial,
        hiddenLabels: partial.hiddenLabels
          ? new Set(Array.from(prev.hiddenLabels).concat(Array.from(partial.hiddenLabels)))
          : prev.hiddenLabels,
        loading: prev.loading && !done,
      }));
    };

    // Determine whether we are a full server administrator or a hub administrator
    api
      .EnumConnection()
      .then(() => merge({ user: 'Administrator' }))
      .catch((error) => {
        if (error.toString() === adminErrorString) {
          merge({ user: 'Hub Administrator', hideAdminOnly: true });
        } else {
          merge({});
        }
        console.log(error);
      });

    // Cluster member/controller servers hide the routes not available in a cluster
    api
      .GetFarmSetting()
      .then((response) => {
        const hidden = new Set<string>();
        if (response.ServerType_u32 === 0) {
          hidden.add('Clustering Status');
        }
        merge({
          hideNonCluster: response.ServerType_u32 === 1 || response.ServerType_u32 === 2,
          hiddenLabels: hidden,
        });
      })
      .catch((error) => {
        console.log(error);
        merge({});
      });

    // DDNS hostname and VPN Azure status
    api
      .GetDDnsClientStatus()
      .then((response) =>
        api
          .GetAzureStatus()
          .then((azure) => merge({ ddnsHostname: response.CurrentHostName_str, azure: azure.IsEnabled_bool })),
      )
      .catch((error) => {
        console.log(error);
        merge({});
      });

    // Capabilities decide which functionalities appear in the navigation
    api
      .GetCaps()
      .then((response) => {
        const hidden = new Set<string>();
        const raw = response as unknown as Record<string, number>;
        const caps = (name: string): boolean => raw[name] == 1;

        if (!caps('caps_b_local_bridge_u32')) hidden.add('Local Bridge');
        if (!caps('caps_b_support_cluster_u32')) hidden.add('Clustering Configuration');
        if (!caps('caps_b_support_layer3_u32')) hidden.add('Layer 3 Switch');
        if (!caps('caps_b_support_azure_u32')) hidden.add('VPN Azure');
        if (!caps('caps_b_support_ddns_u32')) hidden.add('Dynamic DNS');

        const isIpsecCapable = caps('caps_b_support_ipsec_u32');
        const isOpenVPNSupported = caps('caps_b_support_openvpn_u32');
        const isSSTPSupported = caps('caps_b_support_sstp_u32');
        if (!isIpsecCapable && !isOpenVPNSupported && !isSSTPSupported) hidden.add('Legacy Protocols');

        merge({
          capsList: response.CapsList,
          isTapSupported: caps('caps_b_tap_supported_u32'),
          isBridgeMode: caps('caps_b_bridge_u32'),
          isV4: caps('caps_b_vpn4_u32'),
          ddnsProxy: caps('caps_b_support_ddns_proxy_u32'),
          isIpsecCapable,
          isOpenVPNSupported,
          isSSTPSupported,
          hideNonBridge: caps('caps_b_bridge_u32'),
          hiddenLabels: hidden,
        });
      })
      .catch((error) => {
        console.log(error);
        merge({});
      });

    // General server information; a cluster member has no hubs to manage
    api
      .GetServerInfo()
      .then((response) => {
        const hidden = new Set<string>();
        if (response.ServerType_u32 === 2) {
          hidden.add('Hubs');
        }
        merge({ info: response as unknown as Record<string, unknown>, hiddenLabels: hidden });
      })
      .catch((error) => {
        console.log(error);
        merge({});
      });
  }, []);

  return <ServerContext.Provider value={state}>{children}</ServerContext.Provider>;
};
