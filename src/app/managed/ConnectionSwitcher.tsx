import * as React from "react";
import {
  Divider,
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownList,
  MenuToggle,
} from "@patternfly/react-core";
import { PlusCircleIcon, ServerIcon, SignOutAltIcon } from "@patternfly/react-icons";
import { connectionUrl } from "./connection";
import { Connection, directoryPrefix, knownIds, listConnections } from "./connectionDirectory";
import { useConnectionLinkGuard, useGuardedAction } from "./pendingDrafts";
import "./ConnectionSwitcher.css";

interface Props {
  current?: Connection;
  onLogout?: () => void;
  busy?: boolean;
  onExpired?: () => void;
}

const displayHost = ({ host }: Connection) =>
  host.includes(":") && !host.startsWith("[") ? "[" + host + "]" : host;
const endpoint = (c: Connection) => `${displayHost(c)}:${c.port}`;
const scope = ({ hub }: Connection) => (hub ? "Hub: " + hub : "Server admin");

export const ConnectionSwitcher = ({ current, onLogout, onExpired, busy }: Props) => {
  const [open, setOpen] = React.useState(false);
  const [revision, refresh] = React.useReducer((n) => n + 1, 0);
  const [list, setList] = React.useState<Awaited<ReturnType<typeof listConnections>> | null>(null);
  const guard = useGuardedAction();
  const guardLink = useConnectionLinkGuard();
  React.useEffect(() => {
    const storage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith(directoryPrefix)) refresh();
    };
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("storage", storage);
    };
  }, []);
  React.useEffect(() => {
    if (!open) return;
    let live = true;
    void listConnections(current?.connectionId, onExpired).then((result) => {
      if (live) setList(result);
    });
    return () => {
      live = false;
    };
  }, [open, revision, current?.connectionId, onExpired]);

  if (!current && !open && !knownIds().length) return null;
  const toggle = (value: boolean) => {
    if (value) setList(null);
    setOpen(value);
  };
  const label = current ? endpoint(current) + ", " + scope(current) : "Open connections";
  return (
    <>
      {current && (
        <div className="se-connections__identity" title={label}>
          <span className="se-connections__target">
            <span className="se-connections__host">{displayHost(current)}</span>
            <span>:{current.port}</span>
          </span>
          <small className="se-connections__scope">{scope(current)}</small>
        </div>
      )}
      <Dropdown
        isOpen={open}
        onOpenChange={toggle}
        onSelect={() => setOpen(false)}
        className="se-connections__menu"
        isScrollable
        popperProps={{ position: "right", preventOverflow: true }}
        toggle={(ref) => (
          <MenuToggle
            ref={ref}
            variant={current ? "plain" : "plainText"}
            isExpanded={open}
            isDisabled={busy}
            onClick={() => toggle(!open)}
            className="se-connections__toggle"
            aria-label={"Switch connection: " + label}
            title={current ? "Switch connection: " + label : label}
            icon={<ServerIcon />}
          >
            {!current && <span className="se-connections__target">Open connections</span>}
          </MenuToggle>
        )}
      >
        <DropdownGroup label="Connections">
          <DropdownList aria-label="Managed connections">
            {current && (
              <DropdownItem aria-current="true" isSelected description={scope(current)}>
                {endpoint(current)}
              </DropdownItem>
            )}
            {!list && <DropdownItem isDisabled>Checking connections...</DropdownItem>}
            {list?.connections
              .filter((c) => c.connectionId !== current?.connectionId)
              .map((c) => (
                <DropdownItem
                  key={c.connectionId}
                  component="a"
                  to={connectionUrl(c.connectionId)}
                  onClick={guardLink}
                  description={scope(c)}
                >
                  {endpoint(c)}
                </DropdownItem>
              ))}
            {list?.unavailable && (
              <DropdownItem isDisabled>Some connections could not be checked</DropdownItem>
            )}
            {!current && list && !list.unavailable && !list.connections.length && (
              <DropdownItem isDisabled>No active connections</DropdownItem>
            )}
          </DropdownList>
        </DropdownGroup>
        {current && <Divider />}
        {current && (
          <DropdownList aria-label="Connection actions">
            <DropdownItem
              component="a"
              to={connectionUrl(null)}
              onClick={guardLink}
              icon={<PlusCircleIcon />}
            >
              Connect another server
            </DropdownItem>
            <DropdownItem
              onClick={() => onLogout && guard(onLogout)}
              isDisabled={busy}
              icon={<SignOutAltIcon />}
            >
              Disconnect this connection
            </DropdownItem>
          </DropdownList>
        )}
      </Dropdown>
    </>
  );
};
