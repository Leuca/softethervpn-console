import { describe, expect, it } from 'vitest';
import { IAppRoute, IAppRouteGroup, routes } from './routes';

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
});
