import * as React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Masthead,
  MastheadBrand,
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

const AppLayout: React.FunctionComponent<IAppLayout> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hideAdminOnly, hideNonCluster, hideNonBridge, hiddenLabels } = useServer();

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
          <PageToggleButton variant="plain" aria-label="Global navigation">
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
        <span className="se-user">
          <UserIcon />
          <span className="se-user__role">{user}</span>
        </span>
      </MastheadMain>
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
    <PageSidebar className="se-sidebar">
      <PageSidebarBody>{Navigation}</PageSidebarBody>
    </PageSidebar>
  );

  const pageId = 'primary-app-container';

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
      isManagedSidebar
      sidebar={Sidebar}
      skipToContent={PageSkipToContent}
    >
      {children}
    </Page>
  );
};

export { AppLayout };
