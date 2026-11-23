import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessList } from "./AccessList";
import { api } from "@app/utils/vpnrpc_settings";

const serverState = vi.hoisted(() => ({
  capsList: [] as unknown[],
}));

// Advertise the caps a supported server would; missing caps gate closed.
const fullCaps = [
  { CapsName_str: "b_support_ipv6_acl", CapsValue_u32: 1 },
  { CapsName_str: "b_support_check_mac", CapsValue_u32: 1 },
  { CapsName_str: "b_support_check_tcp_state", CapsValue_u32: 1 },
  { CapsName_str: "b_support_ex_acl", CapsValue_u32: 1 },
  { CapsName_str: "b_support_redirect_url_acl", CapsValue_u32: 1 },
  { CapsName_str: "b_support_acl_group", CapsValue_u32: 1 },
  { CapsName_str: "i_max_access_lists", CapsValue_u32: 4096 },
];

vi.mock("@app/utils/vpnrpc_settings", () => ({
  api: {
    EnumAccess: vi.fn(),
    AddAccess: vi.fn(),
    CallAsync: vi.fn(),
    DeleteAccess: vi.fn(),
    SetAccessList: vi.fn(),
  },
}));

vi.mock("@app/ServerContext", () => ({
  useServer: () => serverState,
}));

const enumAccess = api.EnumAccess as unknown as Mock;
const addAccess = api.AddAccess as unknown as Mock;
const conditionalWrite = api.CallAsync as unknown as Mock;

const rule = {
  Id_u32: 1,
  Note_utf: "block guests",
  Active_bool: true,
  Priority_u32: 100,
  Discard_bool: true,
  IsIPv6_bool: false,
  Protocol_u32: 6,
  SrcIpAddress_ip: "0.0.0.0",
  SrcSubnetMask_ip: "0.0.0.0",
  DestIpAddress_ip: "10.0.0.5",
  DestSubnetMask_ip: "255.255.255.255",
};

describe("AccessList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    serverState.capsList = [...fullCaps];
  });

  afterEach(() => {
    expect(api.DeleteAccess).not.toHaveBeenCalled();
    expect(api.SetAccessList).not.toHaveBeenCalled();
  });

  it("lists rules with action, protocol and endpoints", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });

    render(<AccessList hub="DEFAULT" />);

    expect(await screen.findByText("block guests")).toBeInTheDocument();
    expect(screen.getByText("Discard")).toBeInTheDocument();
    expect(screen.getByText("TCP")).toBeInTheDocument();
    expect(screen.getByText("any")).toBeInTheDocument(); // source 0.0.0.0/0
    expect(screen.getByText("10.0.0.5")).toBeInTheDocument(); // dest /32
  });

  it("toggles a rule with a revision-checked list replacement", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule], AclRevision_str: "rev-a" });
    conditionalWrite.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText("block guests");
    await user.click(screen.getByLabelText("Rule 1 active"));

    const [method, sent] = conditionalWrite.mock.calls[0];
    expect(method).toBe("SetAccessListIfCurrent");
    expect(sent).toMatchObject({ HubName_str: "DEFAULT", AclRevision_str: "rev-a" });
    expect(sent.AccessList[0]).toMatchObject({ Id_u32: 1, Active_bool: false });
  });

  it("aborts a whole-list save when the rule was deleted concurrently", async () => {
    enumAccess
      .mockResolvedValueOnce({ AccessList: [rule], AclRevision_str: "rev-a" })
      .mockResolvedValueOnce({ AccessList: [], AclRevision_str: "rev-b" });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText("block guests");
    await user.click(screen.getByLabelText("Rule 1 active"));

    expect(await screen.findByText(/Review the refreshed list/)).toBeInTheDocument();
    expect(conditionalWrite).not.toHaveBeenCalled();
    expect(await screen.findByText("No access list rules")).toBeInTheDocument();
  });

  it("creates an IPv4 rule via AddAccess", async () => {
    enumAccess.mockResolvedValue({ AccessList: [] });
    addAccess.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText("No access list rules");
    await user.click(screen.getAllByRole("button", { name: "New IPv4 rule" })[0]);
    await user.type(screen.getByLabelText("Memo"), "allow dns");
    await user.selectOptions(screen.getByLabelText("Protocol"), "17");
    await user.type(screen.getByLabelText("Destination port start"), "53");
    await user.click(screen.getByRole("button", { name: "Create" }));

    const sent = addAccess.mock.calls[0][0];
    expect(sent.HubName_str).toBe("DEFAULT");
    expect(sent.AccessListSingle[0]).toMatchObject({
      Note_utf: "allow dns",
      Active_bool: true,
      Priority_u32: 1000,
      Discard_bool: false,
      IsIPv6_bool: false,
      SrcIpAddress_ip: "0.0.0.0",
      SrcSubnetMask_ip: "0.0.0.0",
      DestIpAddress_ip: "0.0.0.0",
      DestSubnetMask_ip: "0.0.0.0",
      Protocol_u32: 17,
      DestPortStart_u32: 53,
    });
  });

  it("edits a rule while preserving unrelated changes from the re-read", async () => {
    const other = { ...rule, Id_u32: 2, Note_utf: "another rule" };
    const changed = { ...other, DestPortStart_u32: 1234 };
    enumAccess
      .mockResolvedValueOnce({ AccessList: [rule, other], AclRevision_str: "rev-a" })
      .mockResolvedValue({
        AccessList: [Object.fromEntries(Object.entries(rule).reverse()), changed],
        AclRevision_str: "rev-b",
      });
    conditionalWrite.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    const row = await screen.findByRole("row", { name: /block guests/ });
    await user.click(within(row).getByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByText("Edit"));
    await user.clear(screen.getByLabelText("Priority"));
    await user.type(screen.getByLabelText("Priority"), "50");
    await user.clear(screen.getByLabelText("Memo"));
    await user.type(screen.getByLabelText("Memo"), "block tcp service");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [method, sent] = conditionalWrite.mock.calls[0];
    expect(method).toBe("SetAccessListIfCurrent");
    expect(sent).toMatchObject({ HubName_str: "DEFAULT", AclRevision_str: "rev-b" });
    expect(sent.AccessList[0]).toMatchObject({
      Id_u32: 1,
      Priority_u32: 50,
      Note_utf: "block tcp service",
      Protocol_u32: 6,
    });
    expect(sent.AccessList).toHaveLength(2);
    expect(sent.AccessList[1]).toMatchObject(changed);
  }, 10_000);

  it("keeps the draft and its original baseline when the server row changes", async () => {
    const original = { ...rule, SrcMacAddress_bin: "AAAAAAAA" };
    enumAccess
      .mockResolvedValueOnce({ AccessList: [original], AclRevision_str: "rev-a" })
      .mockResolvedValue({
        AccessList: [{ ...original, SrcMacAddress_bin: "AAAAAAAB" }],
        AclRevision_str: "rev-b",
      });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByText("Edit"));
    const dialog = within(await screen.findByRole("dialog"));
    await user.clear(dialog.getByLabelText("Memo"));
    await user.type(dialog.getByLabelText("Memo"), "my draft");
    const save = dialog.getByRole("button", { name: "Save" });
    await user.click(save);
    expect(await dialog.findByText(/Review the refreshed list/)).toBeInTheDocument();
    await user.click(save);
    expect(dialog.getByLabelText("Memo")).toHaveValue("my draft");
    expect(enumAccess).toHaveBeenCalledTimes(3);
    expect(conditionalWrite).not.toHaveBeenCalled();
  });

  it("does not toggle a different rule at the same position", async () => {
    enumAccess
      .mockResolvedValueOnce({
        AccessList: [{ ...rule, UniqueId_u32: 40000 }],
        AclRevision_str: "a",
      })
      .mockResolvedValue({ AccessList: [{ ...rule, UniqueId_u32: 40001 }], AclRevision_str: "b" });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByLabelText("Rule 1 active"));
    expect(await screen.findByText(/Review the refreshed list/)).toBeInTheDocument();
    expect(conditionalWrite).not.toHaveBeenCalled();
  });

  it("clones a rule via AddAccess with the next unused priority", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    addAccess.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText("block guests");
    expect(screen.getByText(/Upgrade the VPN server/)).toBeInTheDocument();
    expect(screen.getByLabelText("Rule 1 active")).toBeDisabled();
    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    for (const action of ["Edit", "Delete"]) {
      expect(screen.getByText(action).closest('[aria-disabled="true"]')).toBeInTheDocument();
    }
    await user.click(await screen.findByText("Clone"));
    await user.click(screen.getByRole("button", { name: "Create" }));

    const sent = addAccess.mock.calls[0][0];
    expect(sent.HubName_str).toBe("DEFAULT");
    expect(sent.AccessListSingle[0]).toMatchObject({
      Id_u32: 0,
      Note_utf: "block guests",
      Priority_u32: 101,
      Discard_bool: true,
      Protocol_u32: 6,
    });
  });

  it("hides unsupported advanced fields from the editor", async () => {
    serverState.capsList = [
      { CapsName_str: "b_support_ipv6_acl", CapsValue_u32: 0 },
      { CapsName_str: "b_support_check_mac", CapsValue_u32: 0 },
      { CapsName_str: "b_support_check_tcp_state", CapsValue_u32: 0 },
      { CapsName_str: "b_support_ex_acl", CapsValue_u32: 0 },
      { CapsName_str: "b_support_redirect_url_acl", CapsValue_u32: 0 },
      { CapsName_str: "b_support_acl_group", CapsValue_u32: 0 },
    ];
    enumAccess.mockResolvedValue({ AccessList: [rule], AclRevision_str: "rev-a" });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText("block guests");
    expect(screen.getByRole("button", { name: "New IPv6 rule" })).toBeDisabled();

    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByText("Edit"));

    expect(screen.getByLabelText("Source user")).toBeInTheDocument();
    expect(screen.queryByLabelText("Source user or group")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Match source MAC")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Match TCP connection state")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("HTTP redirect URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delay (ms)")).not.toBeInTheDocument();
  });

  it("disables create and clone actions at the access-list limit", async () => {
    serverState.capsList = [{ CapsName_str: "i_max_access_lists", CapsValue_u32: 1 }];
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText("block guests");

    expect(screen.getByRole("button", { name: "New IPv4 rule" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New IPv6 rule" })).toBeDisabled();

    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    expect(
      (await screen.findByText("Clone")).closest('[aria-disabled="true"]'),
    ).toBeInTheDocument();
  });

  it("deletes by position under the freshly enumerated revision", async () => {
    const original = { ...rule, UniqueId_u32: 40000 };
    enumAccess
      .mockResolvedValueOnce({ AccessList: [original], AclRevision_str: "rev-a" })
      .mockResolvedValue({ AccessList: [original], AclRevision_str: "rev-b" });
    conditionalWrite.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText("block guests");
    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByText("Delete"));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(conditionalWrite).toHaveBeenCalledWith("DeleteAccessIfCurrent", {
      HubName_str: "DEFAULT",
      Id_u32: 1,
      AclRevision_str: "rev-b",
    });
    expect(enumAccess).toHaveBeenCalledTimes(3);
  });

  it("does not delete a renumbered rule or the new occupant of its ID", async () => {
    enumAccess
      .mockResolvedValueOnce({ AccessList: [rule], AclRevision_str: "a" })
      .mockResolvedValue({
        AclRevision_str: "b",
        AccessList: [
          { ...rule, Note_utf: "new occupant" },
          { ...rule, Id_u32: 2 },
        ],
      });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByText("Delete"));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Review the refreshed list/)).toBeInTheDocument();
    expect(screen.getByText("new occupant")).toBeInTheDocument();
    expect(conditionalWrite).not.toHaveBeenCalled();
  });

  it.each([undefined, "", 3])(
    "sends no write without an opaque revision (%s)",
    async (revision) => {
      enumAccess
        .mockResolvedValueOnce({ AccessList: [rule], AclRevision_str: "rev-a" })
        .mockResolvedValue({ AccessList: [rule], AclRevision_str: revision });
      const user = userEvent.setup();

      render(<AccessList hub="DEFAULT" />);
      await user.click(await screen.findByLabelText("Rule 1 active"));
      expect(await screen.findByText(/No changes were sent/)).toBeInTheDocument();
      expect(conditionalWrite).not.toHaveBeenCalled();
    },
  );

  it("retains the draft without retrying a rejected conditional save", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule], AclRevision_str: "rev-a" });
    conditionalWrite.mockRejectedValue(new Error("ACL revision mismatch"));
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByText("Edit"));
    const dialog = within(await screen.findByRole("dialog"));
    await user.clear(dialog.getByLabelText("Memo"));
    await user.type(dialog.getByLabelText("Memo"), "my draft");
    await user.click(dialog.getByRole("button", { name: "Save" }));
    expect(await dialog.findByText(/ACL revision mismatch/)).toBeInTheDocument();
    expect(dialog.getByLabelText("Memo")).toHaveValue("my draft");
    expect(conditionalWrite).toHaveBeenCalledTimes(1);
  });

  it("does not fall back when conditional delete is unsupported", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule], AclRevision_str: "rev-a" });
    conditionalWrite.mockRejectedValue(new Error("Method not found"));
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: /kebab toggle/i }));
    await user.click(await screen.findByText("Delete"));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Method not found/)).toBeInTheDocument();
    expect(conditionalWrite).toHaveBeenCalledTimes(1);
  });
});
