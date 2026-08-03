import * as React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { Layer3Switch } from "./Layer3Switch";
import { useTransitionRefresh } from "@app/utils/useTransitionRefresh";
import { api } from "@app/utils/vpnrpc_settings";

vi.mock("@app/utils/vpnrpc_settings", () => ({
  api: {
    EnumL3Switch: vi.fn(),
    EnumHub: vi.fn(),
    AddL3Switch: vi.fn(),
    DelL3Switch: vi.fn(),
    StartL3Switch: vi.fn(),
    StopL3Switch: vi.fn(),
    EnumL3If: vi.fn(),
    EnumL3Table: vi.fn(),
    AddL3If: vi.fn(),
    DelL3If: vi.fn(),
    AddL3Table: vi.fn(),
    DelL3Table: vi.fn(),
  },
}));

vi.mock("@app/utils/useTransitionRefresh", () => ({
  useTransitionRefresh: vi.fn(),
}));

const m = (name: keyof typeof api) => api[name] as unknown as Mock;
const transitionRefresh = useTransitionRefresh as unknown as Mock;

const runTransitionRefresh = async (key: string): Promise<boolean> => {
  const call = [...transitionRefresh.mock.calls]
    .reverse()
    .find(([transitionKey]) => transitionKey === key);
  expect(call).toBeDefined();

  let result = false;
  await act(async () => {
    result = await call![1]();
  });
  return result;
};

const setup = (over: { switches?: unknown[]; ifs?: unknown[]; routes?: unknown[] } = {}) => {
  m("EnumL3Switch").mockResolvedValue({
    L3SWList: over.switches ?? [
      {
        Name_str: "L3SW",
        NumInterfaces_u32: 1,
        NumTables_u32: 2,
        Active_bool: false,
        Online_bool: false,
      },
    ],
  });
  m("EnumHub").mockResolvedValue({ HubList: [{ HubName_str: "DEFAULT" }] });
  m("EnumL3If").mockResolvedValue({
    L3IFList: over.ifs ?? [
      {
        Name_str: "L3SW",
        HubName_str: "DEFAULT",
        IpAddress_ip: "192.168.0.1",
        SubnetMask_ip: "255.255.255.0",
      },
    ],
  });
  m("EnumL3Table").mockResolvedValue({
    L3Table: over.routes ?? [
      {
        Name_str: "L3SW",
        NetworkAddress_ip: "0.0.0.0",
        SubnetMask_ip: "0.0.0.0",
        GatewayAddress_ip: "192.168.0.254",
        Metric_u32: 1,
      },
    ],
  });
};

describe("Layer3Switch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists switches with a status label", async () => {
    setup({
      switches: [
        {
          Name_str: "L3SW",
          NumInterfaces_u32: 1,
          NumTables_u32: 2,
          Active_bool: true,
          Online_bool: true,
        },
      ],
    });
    render(<Layer3Switch />);

    const row = (await screen.findByRole("button", { name: "L3SW" })).closest("tr") as HTMLElement;
    expect(within(row).getByText("Operational")).toBeInTheDocument();
  });

  it("creates a switch", async () => {
    setup({ switches: [] });
    m("AddL3Switch").mockResolvedValue({});
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await screen.findByText("No Layer 3 switches");
    await user.click(screen.getByRole("button", { name: /create switch/i }));
    await user.type(await screen.findByLabelText("Switch name"), "NEWSW");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(m("AddL3Switch")).toHaveBeenCalledTimes(1));
    expect(m("AddL3Switch").mock.calls[0][0].Name_str).toBe("NEWSW");
  });

  it("shows interfaces and routes when a switch is selected", async () => {
    setup();
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));

    expect(await screen.findByText("192.168.0.1")).toBeInTheDocument();
    expect(screen.getByText("192.168.0.254")).toBeInTheDocument();
    expect(m("EnumL3If").mock.calls[0][0].Name_str).toBe("L3SW");
  });

  it("adds an interface to the selected switch", async () => {
    setup({ ifs: [] });
    m("AddL3If").mockResolvedValue({});
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));
    await user.click(await screen.findByRole("button", { name: "Add interface" }));

    await user.type(screen.getByLabelText("IP address"), "10.0.0.1");
    await user.type(screen.getByLabelText("Subnet mask"), "255.255.255.0");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(m("AddL3If")).toHaveBeenCalledTimes(1));
    const p = m("AddL3If").mock.calls[0][0];
    expect(p).toMatchObject({ Name_str: "L3SW", HubName_str: "DEFAULT", IpAddress_ip: "10.0.0.1" });
  });

  it("rejects interface addresses the server will reject", async () => {
    setup({ ifs: [] });
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));
    await user.click(await screen.findByRole("button", { name: "Add interface" }));

    const dialog = await screen.findByRole("dialog");
    const ip = within(dialog).getByLabelText("IP address");
    const mask = within(dialog).getByLabelText("Subnet mask");
    const add = within(dialog).getByRole("button", { name: "Add" });

    fireEvent.change(ip, { target: { value: "999.0.0.1" } });
    fireEvent.change(mask, { target: { value: "255.255.255.0" } });
    expect(add).toBeDisabled();

    fireEvent.change(ip, { target: { value: "10.0.0.1" } });
    fireEvent.change(mask, { target: { value: "255.0.255.0" } });
    expect(add).toBeDisabled();

    fireEvent.change(ip, { target: { value: "10.0.0.0" } });
    fireEvent.change(mask, { target: { value: "255.255.255.0" } });
    expect(add).toBeDisabled();
    expect(m("AddL3If")).not.toHaveBeenCalled();
  });

  it("adds a route to the selected switch", async () => {
    setup({ routes: [] });
    m("AddL3Table").mockResolvedValue({});
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));
    await user.click(await screen.findByRole("button", { name: "Add route" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Network address"), "192.168.10.0");
    await user.type(within(dialog).getByLabelText("Subnet mask"), "255.255.255.0");
    await user.type(within(dialog).getByLabelText("Gateway address"), "192.168.0.254");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(m("AddL3Table")).toHaveBeenCalledTimes(1));
    const p = m("AddL3Table").mock.calls[0][0];
    expect(p).toMatchObject({
      Name_str: "L3SW",
      NetworkAddress_ip: "192.168.10.0",
      SubnetMask_ip: "255.255.255.0",
      GatewayAddress_ip: "192.168.0.254",
    });
  });

  it("rejects route entries the server will reject", async () => {
    setup({ routes: [] });
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));
    await user.click(await screen.findByRole("button", { name: "Add route" }));

    const dialog = await screen.findByRole("dialog");
    const network = within(dialog).getByLabelText("Network address");
    const mask = within(dialog).getByLabelText("Subnet mask");
    const gateway = within(dialog).getByLabelText("Gateway address");
    const add = within(dialog).getByRole("button", { name: "Add" });

    fireEvent.change(network, { target: { value: "192.168.10.1" } });
    fireEvent.change(mask, { target: { value: "255.255.255.0" } });
    fireEvent.change(gateway, { target: { value: "192.168.0.254" } });
    expect(add).toBeDisabled();

    fireEvent.change(network, { target: { value: "192.168.10.0" } });
    fireEvent.change(mask, { target: { value: "255.0.255.0" } });
    fireEvent.change(gateway, { target: { value: "192.168.0.254" } });
    expect(add).toBeDisabled();

    fireEvent.change(network, { target: { value: "192.168.10.0" } });
    fireEvent.change(mask, { target: { value: "255.255.255.0" } });
    fireEvent.change(gateway, { target: { value: "0.0.0.0" } });
    expect(add).toBeDisabled();
    expect(m("AddL3Table")).not.toHaveBeenCalled();
  });

  it("disables editing while the switch is running", async () => {
    setup({
      switches: [
        {
          Name_str: "L3SW",
          NumInterfaces_u32: 1,
          NumTables_u32: 0,
          Active_bool: true,
          Online_bool: true,
        },
      ],
    });
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));

    expect(await screen.findByText(/stop the switch to change/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add interface" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add route" })).toBeDisabled();
  });

  it("disables editing while the switch is active but offline", async () => {
    setup({
      switches: [
        {
          Name_str: "L3SW",
          NumInterfaces_u32: 1,
          NumTables_u32: 0,
          Active_bool: true,
          Online_bool: false,
        },
      ],
    });
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));

    expect(await screen.findByText("Active (offline)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add interface" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add route" })).toBeDisabled();

    const rowAction = screen
      .getAllByRole("button", { name: /kebab toggle/i })
      .find((button) => !button.hasAttribute("disabled"));
    expect(rowAction).toBeDefined();
    await user.click(rowAction as HTMLElement);
    expect(await screen.findByRole("menuitem", { name: "Stop" })).toBeInTheDocument();
  });

  it("rejects duplicate interfaces before calling the server", async () => {
    setup();
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));
    await user.click(await screen.findByRole("button", { name: "Add interface" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("IP address"), "10.0.0.1");
    await user.type(within(dialog).getByLabelText("Subnet mask"), "255.255.255.0");

    expect(
      within(dialog).getByText("This switch already has an interface for the selected hub."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
    expect(m("AddL3If")).not.toHaveBeenCalled();
  });

  it("rejects duplicate routes and invalid metrics before calling the server", async () => {
    setup();
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await user.click(await screen.findByRole("button", { name: "L3SW" }));
    await user.click(await screen.findByRole("button", { name: "Add route" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Network address"), "0.0.0.0");
    await user.type(within(dialog).getByLabelText("Subnet mask"), "0.0.0.0");
    await user.type(within(dialog).getByLabelText("Gateway address"), "192.168.0.254");

    expect(
      within(dialog).getByText("This routing table entry already exists."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();

    await user.clear(within(dialog).getByLabelText("Metric"));
    await user.type(within(dialog).getByLabelText("Metric"), "0");

    expect(
      within(dialog).getByText("Metric must be a whole number from 1 to 4294967295."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
    expect(m("AddL3Table")).not.toHaveBeenCalled();
  });

  it("starts a stopped switch from the kebab", async () => {
    setup();
    m("EnumL3Switch")
      .mockResolvedValueOnce({
        L3SWList: [
          {
            Name_str: "L3SW",
            NumInterfaces_u32: 1,
            NumTables_u32: 2,
            Active_bool: false,
            Online_bool: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        L3SWList: [
          {
            Name_str: "L3SW",
            NumInterfaces_u32: 1,
            NumTables_u32: 2,
            Active_bool: false,
            Online_bool: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        L3SWList: [
          {
            Name_str: "L3SW",
            NumInterfaces_u32: 1,
            NumTables_u32: 2,
            Active_bool: true,
            Online_bool: false,
          },
        ],
      })
      .mockResolvedValue({
        L3SWList: [
          {
            Name_str: "L3SW",
            NumInterfaces_u32: 1,
            NumTables_u32: 2,
            Active_bool: true,
            Online_bool: true,
          },
        ],
      });
    let resolveStart!: () => void;
    m("StartL3Switch").mockReturnValue(
      new Promise<void>((resolve) => {
        resolveStart = resolve;
      }),
    );
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await screen.findByRole("button", { name: "L3SW" });
    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Start" }));

    await waitFor(() => expect(m("StartL3Switch")).toHaveBeenCalledTimes(1));
    expect(m("StartL3Switch").mock.calls[0][0].Name_str).toBe("L3SW");
    expect(await runTransitionRefresh("L3SW")).toBe(false);
    await act(async () => {
      resolveStart();
      await Promise.resolve();
    });
    await waitFor(() => expect(m("EnumL3Switch")).toHaveBeenCalledTimes(3));
    expect(await runTransitionRefresh("L3SW")).toBe(true);
    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(m("EnumL3Switch")).toHaveBeenCalledTimes(4);
    expect(m("EnumHub")).toHaveBeenCalledTimes(2);
  });

  it("deletes a switch after confirmation", async () => {
    setup();
    m("DelL3Switch").mockResolvedValue({});
    const user = userEvent.setup();

    render(<Layer3Switch />);
    await screen.findByRole("button", { name: "L3SW" });
    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(m("DelL3Switch")).toHaveBeenCalledTimes(1));
    expect(m("DelL3Switch").mock.calls[0][0].Name_str).toBe("L3SW");
  });
});
