<?php

if (!!'${{ github.event.inputs.uploadRelease }}') {
    // create github release
    echo "create release\n";

    $tagName = date('Ymd') . '-linux-${{ github.run_id }}';

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", [
                'Content-Type: application/json',
                'Authorization: token ${{ secrets.GITHUB_TOKEN }}',
            ]),
            'content' => json_encode([
            'tag_name' => $tagName,
            'name' => $tagName,
            'body' => "automatic release\n\nworkflow run: [${{ github.run_id }}](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }})",
            //'draft' => true,
            //'prerelease' => true,
            ]),
        ],
    ]);
    file_get_contents('https://api.github.com/repos/${{ github.repository }}/releases', context: $context);
}

function arg2arr(string $arg): array
{
    return array_filter(array_map("trim", explode(',', $arg)));
}

$flavors = arg2arr(<<<'ARG'
${{ github.event.inputs.flavors }}
ARG);
$archs = arg2arr(<<<'ARG'
${{ github.event.inputs.archs }}
ARG);
$sapis = arg2arr(<<<'ARG'
${{ github.event.inputs.sapis }}
ARG);
$libcs = arg2arr(<<<'ARG'
${{ github.event.inputs.libcs }}
ARG);
$phpVers = arg2arr(<<<'ARG'
${{ github.event.inputs.phpVers }}
ARG);

if (!$flavors) {
    $flavors = ['min', 'lite', 'max-swow'];
}
if (!$archs) {
    $archs = ['x86_64', 'aarch64'];
}
if (!$sapis) {
    $sapis = ['micro', 'micro-cli', 'cli'];
}
if (!$libcs) {
    $libcs = ['musl', 'glibc'];
}
if (!$phpVers) {
    $phpVers = ['8.0', '8.1', '8.2'];
}

$customLibraries = <<<'ARG'
${{ github.event.inputs.customLibraries }}
ARG;
$customExtensions = <<<'ARG'
${{ github.event.inputs.customExtensions }}
ARG;
$customLibraries = trim($customLibraries);
$customExtensions = trim($customExtensions);

foreach ($archs as $arch) {
    foreach ($libcs as $libc) {
        foreach ($phpVers as $phpVer) {
            $imageTag = "linux-${libc}-${arch}";
            $job = [
                'flavors' => $flavors,
                'customLibraries' => $customLibraries,
                'customExtensions' => $customExtensions,
                'imageTag' => $imageTag,
                'arch' => $arch,
                'sapis' => $sapis,
                'libc' => $libc,
                'phpVer' => $phpVer,
            ];
            $jobs[] = $job;
        }
    }
}

if (!$jobs) {
    echo "no jobs generated\n";
    exit(1);
}

$json = json_encode($jobs);
file_put_contents(getenv('GITHUB_OUTPUT'), "jobs=$json");
# $jsonDebug = <<<'JSON'
# [{
#   "flavors": [
#     "min",
#     "lite",
#     "max"
#   ],
#   "customLibraries": "",
#   "customExtensions": "",
#   "imageTag": "linux-glibc-x86_64-src",
#   "arch": "x86_64",
#   "sapis": [
#     "micro",
#     "micro-cli",
#     "cli"
#   ],
#   "libc": "musl",
#   "phpVer": "8.2"
# }]
# JSON;
# $json = json_encode(json_decode($jsonDebug, true));
# file_put_contents(getenv('GITHUB_OUTPUT'), "jobs=$json");