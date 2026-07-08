import * as React from 'react';
import { Alert, Switch, TextInput } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import * as VPN from 'vpnrpc/dist/vpnrpc';

interface AdminOptionEditorProps {
  ariaLabel: string;
  options: VPN.VpnAdminOption[];
  defaultOptions?: VPN.VpnAdminOption[];
  numericOptions?: Set<string>;
  canChange: boolean;
  onChange: (options: VPN.VpnAdminOption[]) => void;
}

const numericOptionNames = new Set([
  'max_users',
  'max_multilogins_per_user',
  'max_groups',
  'max_accesslists',
  'max_sessions',
  'max_sessions_client',
  'max_sessions_bridge',
  'max_bitrates_download',
  'max_bitrates_upload',
]);

const descriptionFor = (
  option: VPN.VpnAdminOption,
  defaults: VPN.VpnAdminOption[],
): string =>
  option.Descrption_utf ||
  defaults.find((item) => item.Name_str.toLowerCase() === option.Name_str.toLowerCase())?.Descrption_utf ||
  '';

const AdminOptionEditor: React.FunctionComponent<AdminOptionEditorProps> = ({
  ariaLabel,
  options,
  defaultOptions = [],
  numericOptions = numericOptionNames,
  canChange,
  onChange,
}) => {
  const setOptionValue = (name: string, value: number) => {
    onChange(
      options.map((option) =>
        option.Name_str === name ? new VPN.VpnAdminOption({ ...option, Value_u32: value }) : option,
      ),
    );
  };

  return (
    <>
      {!canChange && (
        <Alert variant="info" title="Options are read-only" isInline>
          This connection cannot modify Virtual Hub Administration Options.
        </Alert>
      )}
      <Table aria-label={ariaLabel} variant="compact" gridBreakPoint="grid-md">
        <Thead>
          <Tr>
            <Th width={30}>Option</Th>
            <Th width={15}>Value</Th>
            <Th>Description</Th>
          </Tr>
        </Thead>
        <Tbody>
          {options.map((option) => {
            const numeric = numericOptions.has(option.Name_str);
            return (
              <Tr key={option.Name_str}>
                <Td dataLabel="Option" modifier="breakWord">
                  {option.Name_str}
                </Td>
                <Td dataLabel="Value">
                  {numeric ? (
                    <TextInput
                      type="number"
                      min={0}
                      value={String(option.Value_u32)}
                      onChange={(_event, value) => setOptionValue(option.Name_str, Number(value) || 0)}
                      isDisabled={!canChange}
                      aria-label={`Value for ${option.Name_str}`}
                    />
                  ) : (
                    <Switch
                      id={`admin-option-${option.Name_str}`}
                      label={option.Value_u32 !== 0 ? 'True' : 'False'}
                      isChecked={option.Value_u32 !== 0}
                      onChange={(_event, checked) => setOptionValue(option.Name_str, checked ? 1 : 0)}
                      isDisabled={!canChange}
                      aria-label={`Value for ${option.Name_str}`}
                    />
                  )}
                </Td>
                <Td dataLabel="Description" modifier="breakWord">
                  {descriptionFor(option, defaultOptions) || '-'}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </>
  );
};

export { AdminOptionEditor };
