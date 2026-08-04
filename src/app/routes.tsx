import * as React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Bullseye, Spinner } from "@patternfly/react-core";
import { Dashboard } from "@app/Dashboard/Dashboard";
import { PermissionNotice } from "@app/PermissionNotice/PermissionNotice";
import { NotFound } from "@app/NotFound/NotFound";
import { useServer } from "@app/ServerContext";
import { useDocumentTitle } from "@app/utils/useDocumentTitle";

const loadRoutePages = () => import("@app/routePages");

const Hubs = React.lazy(() => loadRoutePages().then(({ Hubs }) => ({ default: Hubs })));
const LocalBridge = React.lazy(() =>
  loadRoutePages().then(({ LocalBridge }) => ({ default: LocalBridge })),
);
const Layer3Switch = React.lazy(() =>
  loadRoutePages().then(({ Layer3Switch }) => ({ default: Layer3Switch })),
);
const LegacyProtocols = React.lazy(() =>
  loadRoutePages().then(({ LegacyProtocols }) => ({ default: LegacyProtocols })),
);
const EtherIPDetailed = React.lazy(() =>
  loadRoutePages().then(({ EtherIPDetailed }) => ({ default: EtherIPDetailed })),
);
const DynDNS = React.lazy(() => loadRoutePages().then(({ DynDNS }) => ({ default: DynDNS })));
const VpnAzure = React.lazy(() => loadRoutePages().then(({ VpnAzure }) => ({ default: VpnAzure })));
const Listeners = React.lazy(() =>
  loadRoutePages().then(({ Listeners }) => ({ default: Listeners })),
);
const EncryptionNetwork = React.lazy(() =>
  loadRoutePages().then(({ EncryptionNetwork }) => ({ default: EncryptionNetwork })),
);
const ClusterConfig = React.lazy(() =>
  loadRoutePages().then(({ ClusterConfig }) => ({ default: ClusterConfig })),
);
const ClusteringStatus = React.lazy(() =>
  loadRoutePages().then(({ ClusteringStatus }) => ({ default: ClusteringStatus })),
);
const EditConfig = React.lazy(() =>
  loadRoutePages().then(({ EditConfig }) => ({ default: EditConfig })),
);
const ConnectionsList = React.lazy(() =>
  loadRoutePages().then(({ ConnectionsList }) => ({ default: ConnectionsList })),
);
const ServerStatus = React.lazy(() =>
  loadRoutePages().then(({ ServerStatus }) => ({ default: ServerStatus })),
);
const About = React.lazy(() => loadRoutePages().then(({ About }) => ({ default: About })));

export interface IAppRoute {
  label?: string; // Excluding the label will exclude the route from the nav sidebar in AppLayout
  capabilityLabel?: string;
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

export interface IRoutePermissionState {
  hideAdminOnly: boolean;
  hideNonCluster: boolean;
  hideNonBridge: boolean;
  hiddenLabels: Set<string>;
}

export const isRouteAccessible = (
  route: IAppRoute,
  { hideAdminOnly, hideNonCluster, hideNonBridge, hiddenLabels }: IRoutePermissionState,
): boolean => {
  const capabilityLabel = route.capabilityLabel ?? route.label;

  return (
    !(capabilityLabel && hiddenLabels.has(capabilityLabel)) &&
    !(hideAdminOnly && route.isAdmin) &&
    !(hideNonCluster && route.isCluster === false) &&
    !(hideNonBridge && route.isBridge === false)
  );
};

export const routePermissionReason = (
  route: IAppRoute,
  { hideAdminOnly, hideNonCluster, hideNonBridge, hiddenLabels }: IRoutePermissionState,
): string | null => {
  const capabilityLabel = route.capabilityLabel ?? route.label;

  if (capabilityLabel && hiddenLabels.has(capabilityLabel)) {
    return `${capabilityLabel} is not available with this server's capabilities`;
  }
  if (hideAdminOnly && route.isAdmin) {
    return "This page requires server administrator privileges";
  }
  if (hideNonCluster && route.isCluster === false) {
    return "This page is unavailable in cluster mode";
  }
  if (hideNonBridge && route.isBridge === false) {
    return "This page is unavailable in bridge mode";
  }
  return null;
};

const RouteGate: React.FunctionComponent<{ route: IAppRoute; children: React.ReactElement }> = ({
  route,
  children,
}) => {
  const { hideAdminOnly, hideNonCluster, hideNonBridge, hiddenLabels } = useServer();
  const location = useLocation();

  if (
    !isRouteAccessible(route, {
      hideAdminOnly,
      hideNonCluster,
      hideNonBridge,
      hiddenLabels,
    })
  ) {
    return (
      <Navigate
        to="/permission-required"
        replace
        state={{
          requestedPath: location.pathname,
          reason: routePermissionReason(route, {
            hideAdminOnly,
            hideNonCluster,
            hideNonBridge,
            hiddenLabels,
          }),
        }}
      />
    );
  }

  return children;
};

const routes: AppRouteConfig[] = [
  {
    element: <Dashboard />,
    path: "/",
    title: "SoftEther VPN Console | Main Dashboard",
  },
  {
    element: <Hubs />,
    label: "Hubs",
    path: "/hubs",
    title: "SoftEther VPN Console | Hubs",
  },
  // The Hubs component is mounted a second time for hub subpaths, so a
  // selected hub resolves without a dedicated route per subsection.
  {
    capabilityLabel: "Hubs",
    element: <Hubs />,
    path: "/hubs/:hub",
    title: "SoftEther VPN Console | Hubs",
  },
  {
    label: "Functionalities",
    isAdmin: true,
    routes: [
      {
        element: <LocalBridge />,
        label: "Local Bridge",
        path: "/functionalities/localbridge",
        title: "SoftEther VPN Console | Local Bridge",
      },
      {
        element: <Layer3Switch />,
        label: "Layer 3 Switch",
        path: "/functionalities/layer3switch",
        title: "SoftEther VPN Console | Layer 3 Switch",
        isBridge: false,
      },
      {
        element: <LegacyProtocols />,
        label: "Legacy Protocols",
        path: "/functionalities/legacyprotocols",
        title: "SoftEther VPN Console | Legacy Protocols",
        isBridge: false,
      },
      {
        capabilityLabel: "Legacy Protocols",
        element: <EtherIPDetailed />,
        path: "/functionalities/legacyprotocols/etherip",
        title: "SoftEther VPN Console | EtherIP / L2TPv3 detailed settings",
        isBridge: false,
      },
      {
        element: <DynDNS />,
        label: "Dynamic DNS",
        path: "/functionalities/ddns",
        title: "SoftEther VPN Console | Dynamic DNS",
        isBridge: false,
      },
      {
        element: <VpnAzure />,
        label: "VPN Azure",
        path: "/functionalities/vpnazure",
        title: "SoftEther VPN Console | VPN Azure",
        isBridge: false,
      },
    ],
  },
  {
    label: "Settings",
    routes: [
      {
        element: <Listeners />,
        label: "Listeners",
        path: "/settings/listeners",
        title: "SoftEther VPN Console | Listeners",
        isAdmin: true,
      },
      {
        element: <EncryptionNetwork />,
        label: "Encryption And Network",
        path: "/settings/encryptionandnetwork",
        title: "SoftEther VPN Console | Encryption And Network",
        isAdmin: true,
      },
      {
        element: <ClusterConfig />,
        label: "Clustering Configuration",
        path: "/settings/clusterconfig",
        title: "SoftEther VPN Console | Clustering Configuration",
        isAdmin: true,
        isBridge: false,
      },
      {
        element: <ClusteringStatus />,
        label: "Clustering Status",
        path: "/settings/clusterstatus",
        title: "SoftEther VPN Console | Clustering Status",
      },
      {
        element: <EditConfig />,
        label: "Edit Configuration",
        path: "/settings/editconfig",
        title: "SoftEther VPN Console | Edit Config File",
        isAdmin: true,
      },
      {
        element: <ConnectionsList />,
        label: "Connections List",
        path: "/settings/connections",
        title: "SoftEther VPN Console | Connections List",
        isAdmin: true,
      },
      {
        element: <ServerStatus />,
        label: "Server Status",
        path: "/settings/serverstatus",
        title: "SoftEther VPN Console | Server Status",
      },
      {
        element: <About />,
        label: "About This VPN Server",
        path: "/settings/about",
        title: "SoftEther VPN Console | About This VPN Server",
      },
    ],
  },
  {
    element: <PermissionNotice />,
    path: "/permission-required",
    title: "SoftEther VPN Console | Permission Required",
  },
];

const TitledRoute: React.FunctionComponent<{ title: string; children: React.ReactElement }> = ({
  title,
  children,
}) => {
  useDocumentTitle(title);
  return children;
};

// Children inherit the group's isAdmin flag so RouteGate enforces the same
// access rules as the nav, which hides the whole group.
const flattenedRoutes: IAppRoute[] = routes.reduce(
  (flattened, route) => [
    ...flattened,
    ...(route.routes
      ? route.routes.map((child) => ({ ...child, isAdmin: child.isAdmin ?? route.isAdmin }))
      : [route]),
  ],
  [] as IAppRoute[],
);

const AppRoutes = (): React.ReactElement => (
  <React.Suspense
    fallback={
      <Bullseye>
        <Spinner size="xl" aria-label="Loading page" />
      </Bullseye>
    }
  >
    <Routes>
      {flattenedRoutes.map((route, idx) => (
        <Route
          path={route.path}
          element={
            <RouteGate route={route}>
              <TitledRoute title={route.title}>{route.element}</TitledRoute>
            </RouteGate>
          }
          key={idx}
        />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </React.Suspense>
);

export { AppRoutes, routes };
