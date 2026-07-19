%global upstream_version 0.1.2
%global github_owner Leuca
%global frontend_dir %{_datadir}/%{name}
%global gateway_dir %{_libexecdir}/%{name}/gateway

Name:           softethervpn-console
Version:        0.1.2
Release:        1%{?dist}
Summary:        Web management console for SoftEther VPN Server

License:        MIT AND 0BSD AND Apache-2.0 AND BSD-3-Clause AND BlueOak-1.0.0 AND ISC
URL:            https://github.com/%{github_owner}/%{name}
Source0:        https://github.com/%{github_owner}/%{name}/archive/v%{upstream_version}/%{name}-%{upstream_version}.tar.gz
Source1:        %{name}-%{upstream_version}-nm-prod.tgz
Source2:        %{name}-%{upstream_version}-nm-dev.tgz
Source3:        %{name}-gateway-%{upstream_version}-nm-prod.tgz
Source4:        %{name}-gateway-%{upstream_version}-nm-dev.tgz
Source5:        %{name}-%{upstream_version}-bundled-licenses.txt
Source6:        %{name}-gateway-%{upstream_version}-bundled-licenses.txt
Source7:        %{name}.service
Source8:        %{name}.sysconfig

BuildArch:      noarch
ExclusiveArch:  %{nodejs_arches} noarch

BuildRequires:  nodejs-packaging
BuildRequires:  npm
BuildRequires:  systemd-rpm-macros
Requires:       /usr/bin/node
%{?systemd_requires}

# The application has no supported system-module build. Fedora's Node.js
# guidelines therefore permit bundled modules and require them to be declared.
# This marker is replaced with lockfile-derived Provides by build-srpm.sh.
# @BUNDLED_PROVIDES@

%description
SoftEther VPN Console is a browser-based management interface for SoftEther
VPN Server. This package contains the managed frontend and its Node.js gateway.
The gateway serves the frontend over HTTP and proxies authenticated JSON-RPC
requests to a server selected at login. Public TLS must be provided by a
trusted reverse proxy.

%prep
%autosetup -n %{name}-%{upstream_version}

cp -p %{SOURCE5} .
cp -p %{SOURCE6} .

# Dependency archives are produced by Fedora's nodejs-packaging-bundler in the
# release workflow. RPM builds remain offline and never contact npmjs.org.
tar -xzf %{SOURCE1}
tar -xzf %{SOURCE2}
tar -xzf %{SOURCE3} -C gateway
tar -xzf %{SOURCE4} -C gateway

mkdir -p node_modules gateway/node_modules
cp -a node_modules_prod/. node_modules/
cp -a node_modules_dev/. node_modules/
cp -a gateway/node_modules_prod/. gateway/node_modules/
cp -a gateway/node_modules_dev/. gateway/node_modules/

%build
npm run build:managed
npm --prefix gateway run build

%check
npm test
npm --prefix gateway test

%install
install -d %{buildroot}%{frontend_dir}
cp -a dist/. %{buildroot}%{frontend_dir}/

install -d %{buildroot}%{gateway_dir}/node_modules
install -p -m 0644 gateway/package.json %{buildroot}%{gateway_dir}/package.json
cp -a gateway/dist %{buildroot}%{gateway_dir}/dist
cp -a gateway/node_modules_prod/. %{buildroot}%{gateway_dir}/node_modules/

install -D -p -m 0644 %{SOURCE7} %{buildroot}%{_unitdir}/%{name}.service
install -D -p -m 0644 %{SOURCE8} %{buildroot}%{_sysconfdir}/sysconfig/%{name}

%post
%systemd_post %{name}.service

%preun
%systemd_preun %{name}.service

%postun
%systemd_postun_with_restart %{name}.service

%files
%license LICENSE
%license %{name}-%{upstream_version}-bundled-licenses.txt
%license %{name}-gateway-%{upstream_version}-bundled-licenses.txt
%doc README.md
%doc gateway/README.md
%doc packaging/README.md
%config(noreplace) %{_sysconfdir}/sysconfig/%{name}
%{_unitdir}/%{name}.service
%{frontend_dir}
%{_libexecdir}/%{name}

%changelog
# @RELEASE_CHANGELOG@
