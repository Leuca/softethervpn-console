import * as React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
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
    GetHubAdminOptions: vi.fn(),
  },
}));

vi.mock("@app/ServerContext", () => ({
  useServer: () => serverState,
}));

const enumAccess = api.EnumAccess as unknown as Mock;
const addAccess = api.AddAccess as unknown as Mock;
const conditionalWrite = api.CallAsync as unknown as Mock;
const setAccessList = api.SetAccessList as unknown as Mock;
const adminOptions = vi.mocked(api.GetHubAdminOptions);
const warning = "No protection against concurrent ACL changes";

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
    adminOptions.mockResolvedValue({ HubName_str: "DEFAULT", AdminOptionList: [] });
    serverState.capsList = [...fullCaps];
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

  it("names the editor and restores keyboard focus after reviewing a deletion", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    const user = userEvent.setup();
    render(<AccessList hub="DEFAULT" />);
    const menu = await screen.findByRole("button", { name: "Actions for rule 1" });
    await user.click(menu);
    await user.click(await screen.findByText("Edit"));
    expect(
      await screen.findByRole("dialog", { name: "Edit access list rule #1" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(menu).toHaveFocus());
    await user.click(menu);
    await user.click(await screen.findByText("Delete"));
    const dialog = await screen.findByRole("dialog", { name: /Delete rule/ });
    expect(dialog).toHaveTextContent("block guests");
    expect(dialog).toHaveTextContent("Priority 100");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(menu).toHaveFocus());
    expect(api.DeleteAccess).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "focuses stable actions after a save renumbers a full ACL (patched: %s)",
    async (patched) => {
      serverState.capsList = fullCaps.map((cap) =>
        cap.CapsName_str === "i_max_access_lists" ? { ...cap, CapsValue_u32: 2 } : cap,
      );
      const other = { ...rule, Id_u32: 2, Priority_u32: 200, Note_utf: "other rule" };
      const original = {
        AccessList: [rule, other],
        AclRevision_str: patched ? "rev-a" : undefined,
      };
      enumAccess
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(original)
        .mockResolvedValue({
          ...original,
          AccessList: [
            { ...other, Id_u32: 1 },
            { ...rule, Id_u32: 2, Priority_u32: 300 },
          ],
        });
      const user = userEvent.setup();
      render(<AccessList hub="DEFAULT" />);
      await user.click(await screen.findByRole("button", { name: "Actions for rule 1" }));
      await user.click(await screen.findByText("Edit"));
      const priority = screen.getByLabelText("Priority");
      await user.clear(priority);
      await user.type(priority, "300");
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(screen.getByRole("group", { name: "Access list actions" })).toHaveFocus(),
      );
      expect(
        within(screen.getByRole("row", { name: /other rule/ })).getByRole("button", {
          name: "Actions for rule 1",
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New IPv4 rule" })).toBeDisabled();
      expect(patched ? conditionalWrite : setAccessList).toHaveBeenCalledTimes(1);
    },
  );

  it("shows only applicable port constraints directly in each Traffic cell", async () => {
    const cases = [
      [0, 0, 0, 0, 0, "Any"],
      [0, 0, 0, 443, 443, "TCP/UDP dst 443"],
      [6, 0, 0, 22, 22, "TCP dst 22"],
      [6, 0, 0, 443, 0, "TCP dst 443"],
      [17, 1024, 2048, 53, 54, "UDP src 1024-2048 dst 53-54"],
      [17, 53, 0, 0, 0, "UDP src 53"],
      [6, 0, 0, 0, 0, "TCP"],
      [1, 0, 0, 22, 22, "ICMPv4"],
    ] as const;
    enumAccess.mockResolvedValue({
      AccessList: cases.map(
        (
          [Protocol_u32, SrcPortStart_u32, SrcPortEnd_u32, DestPortStart_u32, DestPortEnd_u32],
          i,
        ) => ({
          ...rule,
          Id_u32: i + 1,
          Protocol_u32,
          SrcPortStart_u32,
          SrcPortEnd_u32,
          DestPortStart_u32,
          DestPortEnd_u32,
        }),
      ),
    });
    render(<AccessList hub="DEFAULT" />);
    for (const [, , , , , summary] of cases) {
      expect(await screen.findByRole("cell", { name: summary })).toBeVisible();
    }
  });

  it("labels invalid input beside the field and preserves a non-contiguous mask", async () => {
    enumAccess.mockResolvedValue({
      AccessList: [
        {
          ...rule,
          SrcIpAddress_ip: "192.0.2.0",
          SrcSubnetMask_ip: "255.255.255.240",
          DestSubnetMask_ip: "255.0.255.0",
        },
      ],
    });
    const user = userEvent.setup();
    render(<AccessList hub="DEFAULT" />);
    expect(await screen.findByText("192.0.2.0/28")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.5/255.0.255.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Actions for rule 1" }));
    await user.click(await screen.findByText("Edit"));
    const mask = screen.getByLabelText("Destination subnet mask");
    await user.clear(mask);
    expect(mask).toHaveAttribute("aria-invalid", "true");
    expect(mask).toHaveAccessibleDescription(/Destination IPv4 subnet mask must be valid/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it.each(["IPv4", "IPv6"])(
    "flags both invalid %s address and mask, then clears only the repaired field",
    async (version) => {
      enumAccess.mockResolvedValue({ AccessList: [] });
      const user = userEvent.setup();
      render(<AccessList hub="DEFAULT" />);
      await screen.findByText("No access list rules");
      await user.click(screen.getByRole("button", { name: `New ${version} rule` }));
      const side = version === "IPv4" ? "Source" : "Destination";
      await user.click(screen.getByLabelText(`Any ${side.toLowerCase()}`));
      const ip = screen.getByLabelText(`${side} IP address`);
      const mask = screen.getByLabelText(`${side} subnet mask`);
      await user.clear(ip);
      await user.clear(mask);
      expect(ip).toHaveAttribute("aria-invalid", "true");
      expect(ip).toHaveAccessibleDescription(
        new RegExp(`${side} ${version} address must be valid`),
      );
      expect(mask).toHaveAttribute("aria-invalid", "true");
      expect(mask).toHaveAccessibleDescription(
        new RegExp(`${side} ${version} subnet mask must be valid`),
      );
      await user.type(ip, version === "IPv4" ? "10.0.0.1" : "::1");
      expect(ip).not.toHaveAttribute("aria-invalid", "true");
      expect(mask).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    },
  );

  it("marks both out-of-range ports and both invalid MAC fields", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    const user = userEvent.setup();
    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: "Actions for rule 1" }));
    await user.click(await screen.findByText("Edit"));
    for (const bound of ["start", "end"]) {
      await user.type(screen.getByLabelText(`Destination port ${bound}`), "65536");
    }
    await user.click(screen.getByRole("button", { name: "Advanced rule settings" }));
    await user.click(screen.getByLabelText("Match source MAC"));
    for (const name of [
      "Destination port start",
      "Destination port end",
      "Source MAC address",
      "Source MAC mask",
    ]) {
      const field = screen.getByLabelText(name);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(/must be/);
    }
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
    expect(setAccessList).not.toHaveBeenCalled();
  });

  it("warns but toggles a rule on an unpatched server", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    expect(await screen.findByText(warning)).toBeInTheDocument();
    await user.click(screen.getByLabelText("Rule 1 active"));

    expect(setAccessList).toHaveBeenCalledWith({
      HubName_str: "DEFAULT",
      AccessList: [expect.objectContaining({ Id_u32: 1, Active_bool: false })],
    });
    expect(conditionalWrite).not.toHaveBeenCalled();
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

  it.each([true, false])(
    "preserves unrelated edits on save (protected: %s)",
    async (protectedWrite) => {
      const other = { ...rule, Id_u32: 2, Note_utf: "another rule" };
      const changed = { ...other, DestPortStart_u32: 1234 };
      enumAccess
        .mockResolvedValueOnce({
          AccessList: [rule, other],
          AclRevision_str: protectedWrite ? "rev-a" : undefined,
        })
        .mockResolvedValue({
          AccessList: [Object.fromEntries(Object.entries(rule).reverse()), changed],
          AclRevision_str: protectedWrite ? "rev-b" : undefined,
        });
      conditionalWrite.mockResolvedValue({});
      const user = userEvent.setup();

      render(<AccessList hub="DEFAULT" />);
      const row = await screen.findByRole("row", { name: /block guests/ });
      await user.click(within(row).getByRole("button", { name: /actions for rule/i }));
      await user.click(await screen.findByText("Edit"));
      expect(Boolean(within(screen.getByRole("dialog")).queryByText(warning))).toBe(
        !protectedWrite,
      );
      await user.clear(screen.getByLabelText("Priority"));
      await user.type(screen.getByLabelText("Priority"), "50");
      await user.clear(screen.getByLabelText("Memo"));
      await user.type(screen.getByLabelText("Memo"), "block tcp service");
      await user.click(screen.getByRole("button", { name: "Save" }));

      let sent;
      if (protectedWrite) {
        expect(conditionalWrite.mock.calls[0][0]).toBe("SetAccessListIfCurrent");
        sent = conditionalWrite.mock.calls[0][1];
        expect(sent.AclRevision_str).toBe("rev-b");
        expect(setAccessList).not.toHaveBeenCalled();
      } else {
        sent = setAccessList.mock.calls[0][0];
        expect(conditionalWrite).not.toHaveBeenCalled();
      }
      expect(sent.HubName_str).toBe("DEFAULT");
      expect(sent.AccessList[0]).toMatchObject({
        Id_u32: 1,
        Priority_u32: 50,
        Note_utf: "block tcp service",
        Protocol_u32: 6,
      });
      expect(sent.AccessList).toHaveLength(2);
      expect(sent.AccessList[1]).toMatchObject(changed);
    },
    10_000,
  );

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
    await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
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
    await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
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

  it.each(["Edit", "Clone"])("preserves wildcard port constraints on %s", async (action) => {
    const ports = {
      Protocol_u32: 0,
      SrcPortStart_u32: 1000,
      SrcPortEnd_u32: 2000,
      DestPortStart_u32: 443,
      DestPortEnd_u32: 443,
    };
    enumAccess.mockResolvedValue({ AccessList: [{ ...rule, ...ports }] });
    addAccess.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: "Actions for rule 1" }));
    await user.click(await screen.findByText(action));
    expect(screen.getByLabelText("Destination port start")).toHaveValue(443);
    const memo = screen.getByLabelText("Memo");
    await user.clear(memo);
    await user.type(memo, "new memo");
    await user.click(screen.getByRole("button", { name: action === "Edit" ? "Save" : "Create" }));
    const sent =
      action === "Edit"
        ? setAccessList.mock.calls[0][0].AccessList
        : addAccess.mock.calls[0][0].AccessListSingle;
    expect(sent).toEqual([expect.objectContaining({ ...ports, Note_utf: "new memo" })]);
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

    await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
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

    await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
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
    await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
    await user.click(await screen.findByText("Delete"));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(conditionalWrite).toHaveBeenCalledWith("DeleteAccessIfCurrent", {
      HubName_str: "DEFAULT",
      Id_u32: 1,
      AclRevision_str: "rev-b",
    });
    expect(enumAccess).toHaveBeenCalledTimes(3);
    expect(api.DeleteAccess).not.toHaveBeenCalled();
  });

  it("warns in the confirmation and deletes on an unpatched server", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
    await user.click(await screen.findByText("Delete"));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(warning)).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    expect(api.DeleteAccess).toHaveBeenCalledWith({ HubName_str: "DEFAULT", Id_u32: 1 });
    expect(conditionalWrite).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "does not delete a renumbered rule (protected: %s)",
    async (protectedWrite) => {
      enumAccess
        .mockResolvedValueOnce({
          AccessList: [rule],
          AclRevision_str: protectedWrite ? "a" : undefined,
        })
        .mockResolvedValue({
          AclRevision_str: protectedWrite ? "b" : undefined,
          AccessList: [
            { ...rule, Note_utf: "new occupant" },
            { ...rule, Id_u32: 2 },
          ],
        });
      const user = userEvent.setup();

      render(<AccessList hub="DEFAULT" />);
      await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
      await user.click(await screen.findByText("Delete"));
      const dialog = within(await screen.findByRole("dialog"));
      await user.click(dialog.getByRole("button", { name: "Delete" }));
      expect(await screen.findByText(/Review the refreshed list/)).toBeInTheDocument();
      expect(screen.getByText("new occupant")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("group", { name: "Access list actions" })).toHaveFocus(),
      );
      expect(conditionalWrite).not.toHaveBeenCalled();
      expect(api.DeleteAccess).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", 3])(
    "stops the current write if advertised protection disappears (%s)",
    async (revision) => {
      enumAccess
        .mockResolvedValueOnce({ AccessList: [rule], AclRevision_str: "rev-a" })
        .mockResolvedValue({ AccessList: [rule], AclRevision_str: revision });
      const user = userEvent.setup();

      render(<AccessList hub="DEFAULT" />);
      await user.click(await screen.findByLabelText("Rule 1 active"));
      expect(await screen.findByText(/No changes were sent/)).toBeInTheDocument();
      expect(screen.getByText(warning)).toBeInTheDocument();
      expect(conditionalWrite).not.toHaveBeenCalled();
      expect(setAccessList).not.toHaveBeenCalled();
    },
  );

  it("retains the draft without retrying a rejected conditional save", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule], AclRevision_str: "rev-a" });
    conditionalWrite.mockRejectedValue(new Error("ACL revision mismatch"));
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
    await user.click(await screen.findByText("Edit"));
    const dialog = within(await screen.findByRole("dialog"));
    await user.clear(dialog.getByLabelText("Memo"));
    await user.type(dialog.getByLabelText("Memo"), "my draft");
    await user.click(dialog.getByRole("button", { name: "Save" }));
    expect(await dialog.findByText(/ACL revision mismatch/)).toBeInTheDocument();
    expect(dialog.getByLabelText("Memo")).toHaveValue("my draft");
    expect(conditionalWrite).toHaveBeenCalledTimes(1);
    expect(setAccessList).not.toHaveBeenCalled();
  });

  it("does not fall back when conditional delete is unsupported", async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule], AclRevision_str: "rev-a" });
    conditionalWrite.mockRejectedValue(new Error("Method not found"));
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await user.click(await screen.findByRole("button", { name: /actions for rule/i }));
    await user.click(await screen.findByText("Delete"));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Method not found/)).toBeInTheDocument();
    expect(conditionalWrite).toHaveBeenCalledTimes(1);
    expect(api.DeleteAccess).not.toHaveBeenCalled();
  });

  describe.each(["stock", "patched"])("%s native writes", (mode) => {
    const patched = mode === "patched";
    const response = (rows: object[], revision = "rev-a") => ({
      AccessList: rows,
      ...(patched ? { AclRevision_str: revision } : {}),
    });
    const other = {
      ...rule,
      Id_u32: 2,
      Note_utf: "service accounts",
      SrcUsername_str: "InClUdE:users",
      DestUsername_str: "exclude:guests",
      Delay_u32: 30,
      Jitter_u32: 5,
      Loss_u32: 2,
    };
    const restrict = (include: number, simulation: number) =>
      adminOptions.mockResolvedValue({
        HubName_str: "DEFAULT",
        AdminOptionList: [
          { Name_str: "no_access_list_include_file", Value_u32: include, Descrption_utf: "" },
          { Name_str: "no_delay_jitter_packet_loss", Value_u32: simulation, Descrption_utf: "" },
        ],
      });
    const writes = patched ? conditionalWrite : setAccessList;
    const noWrites = () => {
      expect(conditionalWrite).not.toHaveBeenCalled();
      expect(setAccessList).not.toHaveBeenCalled();
      expect(api.DeleteAccess).not.toHaveBeenCalled();
    };
    const editRule = async (user: ReturnType<typeof userEvent.setup>, memo: string) => {
      const row = await screen.findByRole("row", { name: /block guests/ });
      await user.click(within(row).getByRole("button", { name: /actions for rule/i }));
      await user.click(await screen.findByText("Edit"));
      await user.clear(screen.getByLabelText("Memo"));
      await user.type(screen.getByLabelText("Memo"), memo);
      await user.click(screen.getByRole("button", { name: "Save" }));
    };
    const confirmDialog = () => screen.findByRole("dialog", { name: /Review changes/ });

    it("names the settings removed by a save, preserves a cancelled draft and rechecks consent", async () => {
      enumAccess.mockResolvedValue(response([rule, other]));
      restrict(1, 0);
      const user = userEvent.setup();
      render(<AccessList hub="DEFAULT" />);
      await editRule(user, "edited");
      let dialog = within(await confirmDialog());
      expect(dialog.getByRole("listitem")).toHaveTextContent(
        "Rule #2 (service accounts): source user filter (InClUdE:users), destination user filter (exclude:guests)",
      );
      expect(dialog.getByRole("listitem")).not.toHaveTextContent("delay");
      await user.click(dialog.getByRole("button", { name: "Cancel" }));
      expect(screen.getByLabelText("Memo")).toHaveValue("edited");
      await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toHaveFocus());
      noWrites();
      await user.click(screen.getByRole("button", { name: "Save" }));
      dialog = within(await confirmDialog());
      restrict(1, 1);
      enumAccess.mockResolvedValue(response([rule, other], "rev-b"));
      await user.click(dialog.getByRole("button", { name: "Save all changes" }));
      expect(dialog.getByRole("listitem")).toHaveTextContent(
        "delay (30 ms), jitter (5%), packet loss (2%)",
      );
      noWrites();
      await user.click(dialog.getByRole("button", { name: "Save all changes" }));
      expect(writes).toHaveBeenCalledTimes(1);
      const expected = {
        HubName_str: "DEFAULT",
        AccessList: [
          expect.objectContaining({ Note_utf: "edited" }),
          expect.objectContaining(other),
        ],
      };
      if (patched) {
        expect(conditionalWrite).toHaveBeenCalledWith("SetAccessListIfCurrent", {
          ...expected,
          AclRevision_str: "rev-b",
        });
        expect(setAccessList).not.toHaveBeenCalled();
      } else {
        expect(setAccessList).toHaveBeenCalledWith(expected);
        expect(conditionalWrite).not.toHaveBeenCalled();
      }
    });

    it("rechecks the target before applying a confirmed toggle", async () => {
      restrict(0, 1);
      enumAccess.mockResolvedValue(response([rule, other]));
      const user = userEvent.setup();
      render(<AccessList hub="DEFAULT" />);
      await user.click(await screen.findByLabelText("Rule 1 active"));
      const dialog = within(await confirmDialog());
      expect(dialog.getByRole("listitem")).not.toHaveTextContent("user filter");
      enumAccess.mockResolvedValue(response([{ ...rule, Note_utf: "different" }, other], "rev-b"));
      await user.click(dialog.getByRole("button", { name: "Save all changes" }));
      expect(await screen.findByText(/Review the refreshed list/)).toBeInTheDocument();
      noWrites();
    });

    it("does not confirm unaffected settings or write without readable options", async () => {
      restrict(0, 0);
      adminOptions.mockRejectedValueOnce(new Error("options unavailable"));
      enumAccess.mockResolvedValue(response([rule, other]));
      const user = userEvent.setup();
      render(<AccessList hub="DEFAULT" />);
      const toggle = await screen.findByLabelText("Rule 1 active");
      await user.click(toggle);
      expect(await screen.findByText(/options unavailable/)).toBeInTheDocument();
      noWrites();
      await user.click(toggle);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it.each([
      ["valid", 0xf012abcd],
      ["missing", undefined],
      ["too small", 32767],
      ["ambiguous", 40000],
      ["out of range", 0x100000000],
    ] as const)("checks the %s hash before deleting rule 32768", async (kind, hash) => {
      const last = { ...rule, Id_u32: 32768, UniqueId_u32: hash, Note_utf: "last rule" };
      enumAccess.mockResolvedValue(response([{ ...rule, UniqueId_u32: 40000 }, last]));
      const user = userEvent.setup();
      render(<AccessList hub="DEFAULT" />);
      const row = await screen.findByRole("row", { name: /last rule/ });
      await user.click(within(row).getByRole("button", { name: /actions for rule/i }));
      await user.click(await screen.findByText("Delete"));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
      );
      expect(adminOptions).not.toHaveBeenCalled();
      if (kind !== "valid") {
        expect(await screen.findByText(/did not provide a unique delete ID/)).toBeInTheDocument();
        noWrites();
      } else if (patched) {
        expect(conditionalWrite).toHaveBeenCalledWith("DeleteAccessIfCurrent", {
          HubName_str: "DEFAULT",
          Id_u32: hash,
          AclRevision_str: "rev-a",
        });
        expect(api.DeleteAccess).not.toHaveBeenCalled();
      } else {
        expect(api.DeleteAccess).toHaveBeenCalledWith({ HubName_str: "DEFAULT", Id_u32: hash });
        expect(conditionalWrite).not.toHaveBeenCalled();
      }
    });
  });
});
