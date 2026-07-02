import * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Dashboard } from '@app/Dashboard/Dashboard';
import { Hubs } from '@app/Hubs/Hubs';
import { LocalBridge } from '@app/Functionalities/LocalBridge/LocalBridge';
import { Layer3Switch } from '@app/Functionalities/Layer3Switch/Layer3Switch';
import { LegacyProtocols } from '@app/Functionalities/LegacyProtocols/LegacyProtocols';
import { EtherIPDetailed } from '@app/Functionalities/LegacyProtocols/EtherIP';
import { DynDNS } from '@app/Functionalities/DDNS/DDNS';
import { VpnAzure } from '@app/Functionalities/VPNAzure/VPNAzure';
import { Listeners } from '@app/Settings/Listeners/Listeners';
import { EncryptionNetwork } from '@app/Settings/EncryptionAndNetwork/EncryptionAndNetwork';
import { ClusterConfig } from '@app/Settings/ClusterConfiguration/ClusterConfiguration';
import { ClusteringStatus } from '@app/Settings/ClusteringStatus/ClusteringStatus';
import { EditConfig } from '@app/Settings/EditConfig/EditConfig';
import { ConnectionsList } from '@app/Settings/ConnectionsList/ConnectionsList';
import { ServerStatus } from '@app/Settings/ServerStatus/ServerStatus';
import { About } from '@app/Settings/About/AboutThisServer';
import { NotFound } from '@app/NotFound/NotFound';
import { useDocumentTitle } from '@app/utils/useDocumentTitle';

export interface IAppRoute {
  label?: string; // Excluding the label will exclude the route from the nav sidebar in AppLayout
  element: React.ReactElement;
  path: string;
  title: string;
  routes?: undefined;
  isAdmin?: boolean;
  isCluster?: boolean;
  isBridge?: boolean;
}

export interface IAppRouteGroup {
  label: string;
  routes: IAppRoute[];
  isAdmin?: boolean;
}

export type AppRouteConfig = IAppRoute | IAppRouteGroup;

const routes: AppRouteConfig[] = [
  {
    element: <Dashboard />,
    path: '/',
    title: 'SoftEther VPN Console | Main Dashboard',
  },
  {
    element: <Hubs />,
    label: 'Hubs',
    path: '/hubs',
    title: 'SoftEther VPN Console | Hubs',
  },
  // The Hubs component is mounted a second time for hub subpaths, so a
  // selected hub resolves without a dedicated route per subsection.
  {
    element: <Hubs />,
    path: '/hubs/:hub',
    title: 'SoftEther VPN Console | Hubs',
  },
  {
    label: 'Functionalities',
    isAdmin: true,
    routes: [
      {
        element: <LocalBridge />,
        label: 'Local Bridge',
        path: '/functionalities/localbridge',
        title: 'SoftEther VPN Console | Local Bridge',
      },
      {
        element: <Layer3Switch />,
        label: 'Layer 3 Switch',
        path: '/functionalities/layer3switch',
        title: 'SoftEther VPN Console | Layer 3 Switch',
        isBridge: false,
      },
      {
        element: <LegacyProtocols />,
        label: 'Legacy Protocols',
        path: '/functionalities/legacyprotocols',
        title: 'SoftEther VPN Console | Legacy Protocols',
        isBridge: false,
      },
      {
        element: <EtherIPDetailed />,
        path: '/functionalities/legacyprotocols/etherip',
        title: 'SoftEther VPN Console | EtherIP / L2TPv3 detailed settings',
      },
      {
        element: <DynDNS />,
        label: 'Dynamic DNS',
        path: '/functionalities/ddns',
        title: 'SoftEther VPN Console | Dynamic DNS',
        isBridge: false,
      },
      {
        element: <VpnAzure />,
        label: 'VPN Azure',
        path: '/functionalities/vpnazure',
        title: 'SoftEther VPN Console | VPN Azure',
        isBridge: false,
      },
    ],
  },
  {
    label: 'Settings',
    routes: [
      {
        element: <Listeners />,
        label: 'Listeners',
        path: '/settings/listeners',
        title: 'SoftEther VPN Console | Listeners',
        isAdmin: true,
      },
      {
        element: <EncryptionNetwork />,
        label: 'Encryption And Network',
        path: '/settings/encryptionandnetwork',
        title: 'SoftEther VPN Console | Encryption And Network',
      },
      {
        element: <ClusterConfig />,
        label: 'Clustering Configuration',
        path: '/settings/clusterconfig',
        title: 'SoftEther VPN Console | Clustering Configuration',
        isAdmin: true,
        isBridge: false,
      },
      {
        element: <ClusteringStatus />,
        label: 'Clustering Status',
        path: '/settings/clusterstatus',
        title: 'SoftEther VPN Console | Clustering Status',
      },
      {
        element: <EditConfig />,
        label: 'Edit Configuration',
        path: '/settings/editconfig',
        title: 'SoftEther VPN Console | Edit Config File',
        isAdmin: true,
      },
      {
        element: <ConnectionsList />,
        label: 'Connections List',
        path: '/settings/connections',
        title: 'SoftEther VPN Console | Connections List',
        isAdmin: true,
      },
      {
        element: <ServerStatus />,
        label: 'Server Status',
        path: '/settings/serverstatus',
        title: 'SoftEther VPN Console | Server Status',
      },
      {
        element: <About />,
        label: 'About This VPN Server',
        path: '/settings/about',
        title: 'SoftEther VPN Console | About This VPN Server',
      },
    ],
  },
];

const TitledRoute: React.FunctionComponent<{ title: string; children: React.ReactElement }> = ({
  title,
  children,
}) => {
  useDocumentTitle(title);
  return children;
};

const flattenedRoutes: IAppRoute[] = routes.reduce(
  (flattened, route) => [...flattened, ...(route.routes ? route.routes : [route])],
  [] as IAppRoute[],
);

const AppRoutes = (): React.ReactElement => (
  <Routes>
    {flattenedRoutes.map(({ path, element, title }, idx) => (
      <Route path={path} element={<TitledRoute title={title}>{element}</TitledRoute>} key={idx} />
    ))}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export { AppRoutes, routes };
