import { describe, expect, it } from 'vitest';
import { IAppRoute, IAppRouteGroup, isRouteAccessible, routePermissionReason, routes } from './routes';

const flattenedRoutes = routes.reduce(
  (items, route) => [...items, ...(route.routes ? route.routes : [route])],
  [] as IAppRoute[],
);

const findRoute = (label: string): IAppRoute | undefined => flattenedRoutes.find((route) => route.label === label);
const findGroup = (label: string): IAppRouteGroup | undefined =>
  routes.find((route): route is IAppRouteGroup => 'routes' in route && route.label === label);

describe('routes', () => {
  it('marks server-wide settings as administrator-only', () => {
    expect(findRoute('Listeners')?.isAdmin).toBe(true);
    expect(findRoute('Encryption And Network')?.isAdmin).toBe(true);
    expect(findRoute('Clustering Configuration')?.isAdmin).toBe(true);
    expect(findRoute('Edit Configuration')?.isAdmin).toBe(true);
    expect(findRoute('Connections List')?.isAdmin).toBe(true);
  });

  it('keeps readable server status pages visible to hub administrators', () => {
    expect(findRoute('Clustering Status')?.isAdmin).toBeUndefined();
    expect(findRoute('Server Status')?.isAdmin).toBeUndefined();
    expect(findRoute('About This VPN Server')?.isAdmin).toBeUndefined();
  });

  it('keeps the Functionalities group administrator-only', () => {
    expect(findGroup('Functionalities')?.isAdmin).toBe(true);
  });

  it('applies navigation restrictions from server probes', () => {
    const editConfig = findRoute('Edit Configuration');
    expect(editConfig).toBeDefined();

    const editableState = {
      hideAdminOnly: true,
      hideNonCluster: false,
      hideNonBridge: false,
      hiddenLabels: new Set<string>(),
    };

    const fullAdmin = {
      hideAdminOnly: false,
      hideNonCluster: false,
      hideNonBridge: false,
      hiddenLabels: new Set<string>(),
    };

    expect(isRouteAccessible(editConfig as IAppRoute, editableState)).toBe(false);
    expect(isRouteAccessible(editConfig as IAppRoute, fullAdmin)).toBe(true);
  });

  it('returns clear reasons for route denial states', () => {
    const listeners = findRoute('Listeners');
    const localBridge = findRoute('Local Bridge');
    const clusterConfig = findRoute('Clustering Configuration');
    const layer3 = findRoute('Layer 3 Switch');
    const adminState = {
      hideAdminOnly: true,
      hideNonCluster: false,
      hideNonBridge: false,
      hiddenLabels: new Set<string>(),
    };

    expect(listeners).toBeDefined();
    expect(localBridge).toBeDefined();
    expect(clusterConfig).toBeDefined();
    expect(layer3).toBeDefined();

    expect(routePermissionReason(listeners as IAppRoute, adminState)).toBe(
      'This page requires server administrator privileges',
    );
    expect(routePermissionReason(localBridge as IAppRoute, {
      hideAdminOnly: false,
      hideNonCluster: false,
      hideNonBridge: false,
      hiddenLabels: new Set(['Local Bridge']),
    })).toBe("Local Bridge is not available with this server's capabilities");
    expect(routePermissionReason(clusterConfig as IAppRoute, {
      hideAdminOnly: false,
      hideNonCluster: true,
      hideNonBridge: false,
      hiddenLabels: new Set<string>(),
    })).toBe('This page is unavailable in cluster mode');
    expect(routePermissionReason(layer3 as IAppRoute, {
      hideAdminOnly: false,
      hideNonCluster: false,
      hideNonBridge: true,
      hiddenLabels: new Set<string>(),
    })).toBe('This page is unavailable in bridge mode');
    expect(routePermissionReason(listeners as IAppRoute, {
      hideAdminOnly: false,
      hideNonCluster: false,
      hideNonBridge: false,
      hiddenLabels: new Set<string>(),
    })).toBeNull();
  });
});
