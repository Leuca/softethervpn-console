import { describe, expect, it } from 'vitest';
import { capBool, capValue } from './caps';

const capsList = [
  { CapsName_str: 'b_support_config_log', CapsValue_u32: 1 },
  { CapsName_str: 'b_support_read_log', CapsValue_u32: 0 },
  { CapsName_str: 'i_max_access_lists', CapsValue_u32: 4096 },
];

describe('caps', () => {
  it('returns advertised capability values', () => {
    expect(capValue(capsList, 'i_max_access_lists')).toBe(4096);
    expect(capBool(capsList, 'b_support_config_log')).toBe(true);
    expect(capBool(capsList, 'b_support_read_log')).toBe(false);
  });

  it('fails closed when a capability is missing', () => {
    // Native GetCapsInt/GetCapsBool (Cedar/Server.c) read a missing
    // capability as 0 / false; an empty list (failed probe) gates the same.
    expect(capValue(capsList, 'i_not_advertised')).toBe(0);
    expect(capBool(capsList, 'b_not_advertised')).toBe(false);
    expect(capValue([], 'i_max_access_lists')).toBe(0);
    expect(capBool([], 'b_support_config_log')).toBe(false);
  });
});
