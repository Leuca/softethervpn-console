export function split_string_by_capitalization(input_string: string): string {
  let newstring = '';
  let last_index_allowed = 0;
  const caps: number[] = [];

  for (let c = 0; c < input_string.length; c++) {
    if (input_string.charCodeAt(c) > 64 && input_string.charCodeAt(c) < 91) {
      caps.push(c);
    }

    if (input_string[c] == '_') {
      last_index_allowed = c;
    }
  }

  for (let i = 0; i < caps.length; i++) {
    if (i < caps.length - 1) {
      newstring = newstring + input_string.slice(caps[i], caps[i + 1]);
      newstring = newstring + ' ';
    }
  }

  if (last_index_allowed > 0) {
    newstring = newstring + input_string.slice(caps[caps.length - 1], last_index_allowed);
  }

  return newstring;
}

export function mode_to_string(mode: number): string {
  if (mode == 0) {
    return 'Standalone Mode';
  }

  if (mode == 1) {
    return 'Cluster Controller';
  }

  if (mode == 2) {
    return 'Cluster Member Server';
  }

  return '';
}

export function crt_field2object(asn_string: string): Record<string, string> {
  const splitted = asn_string.split(', ');
  const object: Record<string, string> = {};

  splitted.forEach((element) => {
    const tmp = element.split('=');
    object[tmp[0]] = tmp[1];
  });
  return object;
}

export function truncate_qm(location: string): string {
  let result = location;
  const qm_index = location.indexOf('?');
  if (qm_index != -1) {
    result = location.slice(0, qm_index);
  }
  return result;
}
