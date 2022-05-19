<?php
/**
 * Copyright (c) 2022 Yun Dou <dixyes@gmail.com>
 *
 * lwmbs is licensed under Mulan PSL v2. You can use this
 * software according to the terms and conditions of the
 * Mulan PSL v2. You may obtain a copy of Mulan PSL v2 at:
 *
 * http://license.coscl.org.cn/MulanPSL2
 *
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS,
 * WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
 * MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
 *
 * See the Mulan PSL v2 for more details.
 */

class Libcurl extends Library
{
    use LinuxLibraryTrait;
    protected string $name = 'curl';
    protected array $staticLibs = [
        'libcurl.a',
    ];
    protected array $headers = [
        'curl',
    ];
    protected array $pkgconfs = [
        'libcurl.pc' => <<<'EOF'
exec_prefix=${prefix}
libdir=${exec_prefix}/lib
includedir=${prefix}/include
supported_protocols="DICT FILE FTP FTPS GOPHER GOPHERS HTTP HTTPS IMAP IMAPS MQTT POP3 POP3S RTSP SCP SFTP SMB SMBS SMTP SMTPS TELNET TFTP"
supported_features="AsynchDNS GSS-API HSTS HTTP2 HTTPS-proxy IDN IPv6 Kerberos Largefile NTLM NTLM_WB PSL SPNEGO SSL TLS-SRP UnixSockets alt-svc brotli libz zstd"

Name: libcurl
URL: https://curl.se/
Description: Library to transfer files with ftp, http, etc.
Version: 7.83.0
Libs: -L${libdir} -lcurl
Libs.private: -lnghttp2 -lidn2 -lssh2 -lssh2 -lpsl -lssl -lcrypto -lssl -lcrypto -lgssapi_krb5 -lzstd -lbrotlidec -lz
Cflags: -I${includedir}
EOF
    ];
    protected array $depNames = [
        'zlib' => false,
        'libssh2' => true,
        'brotli' => true,
        'nghttp2' => true,
    ];

    protected function build(): void
    {
        Log::i("building {$this->name}");

        $zlib = '';
        $libzlib = $this->config->getLib('zlib');
        if ($libzlib) {
            $zlib = '-DZLIB_LIBRARY="' . $libzlib->getStaticLibFiles(style: 'cmake') . '" ' .
                '-DZLIB_INCLUDE_DIR=' . realpath('include') . ' ';
        }

        $libssh2 = '';
        $liblibssh2 = $this->config->getLib('libssh2');
        if ($liblibssh2) {
            $libssh2 = '-DLIBSSH2_LIBRARY="' . $liblibssh2->getStaticLibFiles(style: 'cmake') . '" ' .
                '-DLIBSSH2_INCLUDE_DIR="' . realpath('include') . '" ';
        }

        $brotli = '-DCURL_BROTLI=OFF ';
        $libbrotli = $this->config->getLib('brotli');
        if ($libbrotli) {
            $brotli = '-DCURL_BROTLI=ON ' .
                '-DBROTLIDEC_LIBRARY="' . realpath('lib/libbrotlidec-static.a') . ';' . realpath('lib/libbrotlicommon-static.a') . '" ' .
                '-DBROTLICOMMON_LIBRARY="' . realpath('lib/libbrotlicommon-static.a') . '" ' .
                '-DBROTLI_INCLUDE_DIR="' . realpath('include') . '" ';
        }

        $nghttp2 = '-DUSE_NGHTTP2=OFF ';
        $libnghttp2 = $this->config->getLib('nghttp2');
        if ($libnghttp2) {
            $nghttp2 = '-DUSE_NGHTTP2=ON ' .
                '-DNGHTTP2_LIBRARY="' . $libnghttp2->getStaticLibFiles(style: 'cmake') . '" ' .
                '-DNGHTTP2_INCLUDE_DIR="' . realpath('include') . '" ';
        }

        $ldap = '-DCURL_DISABLE_LDAP=ON ';
        $libldap = $this->config->getLib('ldap');
        if ($libldap) {
            $ldap = '-DCURL_DISABLE_LDAP=OFF ';
            // TODO: LDAP support
            throw new Exception('LDAP support is not implemented yet');
        }

        $ret = 0;
        passthru(
            $this->config->setX . ' && ' .
                "cd {$this->sourceDir} && " .
                'rm -rf build && ' .
                'mkdir -p build && ' .
                'cd build && ' .
                "{$this->config->configureEnv} " . $this->config->libc->getCCEnv() . ' cmake ' .
                // '--debug-find ' .
                '-DCMAKE_BUILD_TYPE=Release ' .
                '-DBUILD_SHARED_LIBS=OFF ' .
                $libssh2 .
                $zlib .
                $brotli .
                $nghttp2 .
                $ldap .
                '-DCMAKE_INSTALL_PREFIX=/ ' .
                '-DCMAKE_INSTALL_LIBDIR=/lib ' .
                '-DCMAKE_INSTALL_INCLUDEDIR=/include ' .
                '.. && ' .
                "make -j{$this->config->concurrency} && " .
                'make install DESTDIR=' . realpath('.'),
            $ret
        );
        if ($ret !== 0) {
            throw new Exception("failed to build {$this->name}");
        }
    }
}