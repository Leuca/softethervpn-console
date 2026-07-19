#!/usr/bin/bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 VERSION [OUTPUT_DIRECTORY]" >&2
  exit 2
fi

upstream_version="$1"
output_dir="${2:-$PWD}"
repository="${GITHUB_REPOSITORY:-Leuca/softethervpn-console}"
owner="${repository%%/*}"
name="softethervpn-console"

if [[ ! "$upstream_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid release version: $upstream_version" >&2
  exit 2
fi

if [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/softethervpn-console$ ]]; then
  echo "Invalid GitHub repository: $repository" >&2
  exit 2
fi

rpm_version="${upstream_version/-/\~}"
work_dir="$(mktemp -d)"
top_dir="$work_dir/rpmbuild"
sources_dir="$top_dir/SOURCES"
specs_dir="$top_dir/SPECS"
source_tree="$work_dir/source"
package_tarballs="$work_dir/npm-packages"

cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

mkdir -p "$sources_dir" "$specs_dir" "$source_tree" "$package_tarballs" "$output_dir"

source_archive="$sources_dir/$name-$upstream_version.tar.gz"
source_url="https://github.com/$repository/archive/v$upstream_version/$name-$upstream_version.tar.gz"
curl --fail --location --retry 5 --retry-all-errors "$source_url" --output "$source_archive"
tar -xzf "$source_archive" -C "$source_tree"

project_dir="$(find "$source_tree" -mindepth 1 -maxdepth 1 -type d -print -quit)"
if [[ -z "$project_dir" ]]; then
  echo "The release archive did not contain a source directory." >&2
  exit 1
fi

create_npm_tarball() {
  local package_dir="$1"
  local expected_tarball="$2"

  cp "$package_dir/package-lock.json" "$package_dir/npm-shrinkwrap.json"
  (cd "$package_dir" && npm pack --ignore-scripts --pack-destination "$package_tarballs" >/dev/null)
  rm -f "$package_dir/npm-shrinkwrap.json"

  if [[ ! -f "$package_tarballs/$expected_tarball" ]]; then
    echo "npm did not create $expected_tarball" >&2
    exit 1
  fi
}

copy_single_bundle_file() {
  local bundle_sources="$1"
  local pattern="$2"
  local destination="$3"
  local matches=()

  mapfile -t matches < <(find "$bundle_sources" -maxdepth 1 -type f -name "$pattern" -print)
  if [[ ${#matches[@]} -ne 1 ]]; then
    echo "Expected one $pattern in $bundle_sources, found ${#matches[@]}" >&2
    exit 1
  fi
  cp -p "${matches[0]}" "$destination"
}

create_dependency_bundle() {
  local bundle_name="$1"
  local package_tarball="$2"
  local destination_prefix="$3"
  local bundle_home="$work_dir/bundles/$bundle_name"
  local bundle_sources="$bundle_home/rpmbuild/SOURCES"

  mkdir -p "$bundle_home"
  HOME="$bundle_home" \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_IGNORE_SCRIPTS=true \
    nodejs-packaging-bundler "$bundle_name" "$upstream_version" "$package_tarball"

  copy_single_bundle_file "$bundle_sources" '*-nm-prod.tgz' "$sources_dir/$destination_prefix-nm-prod.tgz"
  copy_single_bundle_file "$bundle_sources" '*-nm-dev.tgz' "$sources_dir/$destination_prefix-nm-dev.tgz"
  copy_single_bundle_file \
    "$bundle_sources" \
    '*-bundled-licenses.txt' \
    "$sources_dir/$destination_prefix-bundled-licenses.txt"
}

root_package="$name-$upstream_version.tgz"
create_npm_tarball "$project_dir" "$root_package"

create_dependency_bundle "$name" "$package_tarballs/$root_package" "$name-$rpm_version"

cp -p "$project_dir/packaging/$name.service" "$sources_dir/$name.service"
cp -p "$project_dir/packaging/$name.sysconfig" "$sources_dir/$name.sysconfig"

provides_file="$work_dir/bundled-provides.inc"
node "$project_dir/packaging/generate-bundled-provides.mjs" \
  "$project_dir/package-lock.json" \
  "$project_dir/gateway/package-lock.json" > "$provides_file"

release_epoch="${SOURCE_DATE_EPOCH:-$(date +%s)}"
release_date="$(date --utc --date="@$release_epoch" '+%a %b %d %Y')"
rendered_spec="$specs_dir/$name.spec"

awk \
  -v provides_file="$provides_file" \
  -v release_date="$release_date" \
  -v rpm_version="$rpm_version" \
  '
    $0 == "# @BUNDLED_PROVIDES@" {
      while ((getline line < provides_file) > 0) {
        print line
      }
      close(provides_file)
      next
    }
    $0 == "# @RELEASE_CHANGELOG@" {
      print "* " release_date " Luca Magrone <luca@magrone.cc> - " rpm_version "-1"
      print "- Build the managed console source package"
      next
    }
    { print }
  ' "$project_dir/packaging/$name.spec" > "$rendered_spec"

sed -i \
  -e "s/^Version:.*/Version:        $rpm_version/" \
  -e "s/^%global github_owner .*/%global github_owner $owner/" \
  -e "s|^Source0:.*|Source0:        $source_url|" \
  -e "s|^%autosetup -n .*|%autosetup -n $name-$upstream_version|" \
  "$rendered_spec"

rpmbuild -bs --define "_topdir $top_dir" "$rendered_spec"

mapfile -t source_rpms < <(find "$top_dir/SRPMS" -maxdepth 1 -type f -name '*.src.rpm' -print)
if [[ ${#source_rpms[@]} -ne 1 ]]; then
  echo "Expected one source RPM, found ${#source_rpms[@]}" >&2
  exit 1
fi

rpmlint "$rendered_spec" "${source_rpms[0]}"

source_rpm_name="$(basename "${source_rpms[0]}")"
source_rpm_asset_name="${source_rpm_name//\~/.}"
source_rpm="$output_dir/$source_rpm_asset_name"
install -p -m 0644 "${source_rpms[0]}" "$source_rpm"
(
  cd "$output_dir"
  sha256sum "$source_rpm_asset_name" > "$source_rpm_asset_name.sha256"
)
printf '%s\n' "$source_rpm"
