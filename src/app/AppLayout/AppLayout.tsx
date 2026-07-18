import * as React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  MenuToggle,
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
import { IAppRoute, IAppRouteGroup, isRouteAccessible, routes } from '@app/routes';
import { useServer } from '@app/ServerContext';
import { useManagedSession } from '@app/managed/ManagedSessionGate';
import logo from '@app/bgimages/icons8-softether-vpn.svg';

interface IAppLayout {
  children: React.ReactNode;
}

const pageId = 'primary-app-container';

const AppLayout: React.FunctionComponent<IAppLayout> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hideAdminOnly, hideNonCluster, hideNonBridge, hiddenLabels } = useServer();
  const managedSession = useManagedSession();
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);

  // Keep the desktop sidebar user-controlled and stable while treating the
  // narrow sidebar as a dismissible overlay. PatternFly docks the sidebar at
  // its xl breakpoint (1200px).
  const isMobileView = React.useRef(typeof window !== 'undefined' && window.innerWidth < 1200);
  const desktopSidebarOpen = React.useRef(true);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(() => !isMobileView.current);

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!isMobileView.current || target?.closest('#nav-toggle')) {
        return;
      }
      if (target?.closest('#page-sidebar') && !target.closest('a')) {
        return;
      }
      setIsSidebarOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const isRouteVisible = (route: IAppRoute): boolean =>
    !!route.label &&
    isRouteAccessible(route, {
      hideAdminOnly,
      hideNonCluster,
      hideNonBridge,
      hiddenLabels,
    });

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
            onSidebarToggle={() =>
              setIsSidebarOpen((open) => {
                const nextIsOpen = !open;
                if (!isMobileView.current) {
                  desktopSidebarOpen.current = nextIsOpen;
                }
                return nextIsOpen;
              })
            }
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
        {managedSession ? (
          <div className="se-user-menu">
            <Dropdown
              isOpen={isUserMenuOpen}
              onOpenChange={setIsUserMenuOpen}
              onSelect={() => setIsUserMenuOpen(false)}
              popperProps={{ position: 'right' }}
              toggle={(toggleRef) => (
                <MenuToggle
                  ref={toggleRef}
                  aria-label={`User menu for ${user}`}
                  isExpanded={isUserMenuOpen}
                  onClick={() => setIsUserMenuOpen((open) => !open)}
                >
                  <span className="se-user__content">
                    <UserIcon />
                    <span className="se-user__role">{user}</span>
                  </span>
                </MenuToggle>
              )}
            >
              <DropdownList>
                <DropdownItem
                  key="logout"
                  isDisabled={managedSession.isLoggingOut}
                  onClick={managedSession.logout}
                >
                  Log out
                </DropdownItem>
              </DropdownList>
            </Dropdown>
          </div>
        ) : (
          <span className="se-user">
            <UserIcon />
            <span className="se-user__role">{user}</span>
          </span>
        )}
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
      onPageResize={(_event, { mobileView }) => {
        if (mobileView !== isMobileView.current) {
          isMobileView.current = mobileView;
          setIsSidebarOpen(mobileView ? false : desktopSidebarOpen.current);
        }
      }}
    >
      {children}
    </Page>
  );
};

export { AppLayout };
