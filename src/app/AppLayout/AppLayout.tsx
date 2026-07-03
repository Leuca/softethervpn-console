import * as React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  Nav,
  NavExpandable,
  NavItem,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
  SkipToContent,
} from '@patternfly/react-core';
import { BarsIcon, UserIcon } from '@patternfly/react-icons';
import { IAppRoute, IAppRouteGroup, routes } from '@app/routes';
import { useServer } from '@app/ServerContext';
import logo from '@app/bgimages/icons8-softether-vpn.svg';

interface IAppLayout {
  children: React.ReactNode;
}

const pageId = 'primary-app-container';

const AppLayout: React.FunctionComponent<IAppLayout> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hideAdminOnly, hideNonCluster, hideNonBridge, hiddenLabels } = useServer();

  // Control the sidebar ourselves so its collapse behaviour is uniform across
  // viewports: any click anywhere in the viewport closes it, except clicks on
  // the sidebar itself (and the toggle button, which opens/closes it on its
  // own). We still pass onPageResize so PatternFly keeps its resize observer
  // running - that's what feeds the responsive breakpoint and mobile-overlay
  // behaviour; dropping it (as an earlier attempt did) breaks both the desktop
  // collapse and the mobile toggle.
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('#page-sidebar') || target?.closest('#nav-toggle')) {
        return;
      }
      setIsSidebarOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const isRouteVisible = (route: IAppRoute): boolean =>
    !!route.label &&
    !hiddenLabels.has(route.label) &&
    !(hideAdminOnly && route.isAdmin) &&
    !(hideNonCluster && route.isCluster === false) &&
    !(hideNonBridge && route.isBridge === false);

  const isGroupVisible = (group: IAppRouteGroup): boolean =>
    !hiddenLabels.has(group.label) && !(hideAdminOnly && group.isAdmin) && group.routes.some(isRouteVisible);

  const masthead = (
    <Masthead className="se-masthead">
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton
            variant="plain"
            aria-label="Global navigation"
            isSidebarOpen={isSidebarOpen}
            onSidebarToggle={() => setIsSidebarOpen((open) => !open)}
          >
            <BarsIcon />
          </PageToggleButton>
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo>
            <button
              type="button"
              className="se-brand"
              onClick={() => navigate('/')}
              aria-label="SoftEther VPN Console home"
            >
              <img src={logo} className="se-brand__logo" alt="" />
              <span className="se-brand__text">
                <strong>SoftEther</strong>
                <span>VPN Console</span>
              </span>
            </button>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <span className="se-user">
          <UserIcon />
          <span className="se-user__role">{user}</span>
        </span>
      </MastheadContent>
    </Masthead>
  );

  const renderNavItem = (route: IAppRoute, index: number) => (
    <NavItem key={`${route.label}-${index}`} id={`${route.label}-${index}`} isActive={route.path === location.pathname}>
      <NavLink to={route.path}>{route.label}</NavLink>
    </NavItem>
  );

  const renderNavGroup = (group: IAppRouteGroup, groupIndex: number) => (
    <NavExpandable
      key={`${group.label}-${groupIndex}`}
      id={`${group.label}-${groupIndex}`}
      title={group.label}
      isActive={group.routes.some((route) => route.path === location.pathname)}
    >
      {group.routes.map((route, idx) => isRouteVisible(route) && renderNavItem(route, idx))}
    </NavExpandable>
  );

  const Navigation = (
    <Nav id="nav-primary-simple">
      <NavList id="nav-list-simple">
        {routes.map((route, idx) =>
          route.routes
            ? isGroupVisible(route) && renderNavGroup(route, idx)
            : isRouteVisible(route) && renderNavItem(route, idx),
        )}
      </NavList>
    </Nav>
  );

  const Sidebar = (
    <PageSidebar className="se-sidebar" isSidebarOpen={isSidebarOpen}>
      <PageSidebarBody>{Navigation}</PageSidebarBody>
    </PageSidebar>
  );

  const PageSkipToContent = (
    <SkipToContent
      onClick={(event) => {
        event.preventDefault();
        const primaryContentContainer = document.getElementById(pageId);
        primaryContentContainer?.focus();
      }}
      href={`#${pageId}`}
    >
      Skip to Content
    </SkipToContent>
  );
  return (
    <Page
      mainContainerId={pageId}
      masthead={masthead}
      sidebar={Sidebar}
      skipToContent={PageSkipToContent}
      onPageResize={() => undefined}
    >
      {children}
    </Page>
  );
};

export { AppLayout };
