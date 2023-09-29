const fs = require('fs/promises');
const crypto = require('crypto');

const core = require('@actions/core');
const github = require('@actions/github');
const artifact = require('@actions/artifact');
const exec = require('@actions/exec');

const octokit = github.getOctokit(process.env.ACTIONS_RUNTIME_TOKEN);
const artifactClient = artifact.create()

async function main(osName, context) {

  const owner = context.github.repository_owner
  const repo = context.github.repository.replace(`${owner}/`, '')

  const sep = osName === 'windows' ? '\\' : '/'

  const uploadArtifact = !!context.inputs.uploadArtifact

  let sapis = context.matrix.sapis
  let flavors = context.matrix.flavors
  if (osName === 'linux') {
    flavors = flavors.map(flavor => [`${flavor}_static`, `${flavor}_shared`]).flat()
  }
  let binFile = {
    'micro': 'micro.sfx',
    'micro-cli': 'micro_cli.sfx',
    'cli': 'php',
  }
  if (osName === 'windows') {
    binFile = {
      'micro': 'micro.sfx',
      'micro-cli': 'micro_cli.sfx',
      'cli': 'php.exe',
    }
  }

  let artifacts = {};
  let results = {};

  let versionFile = await fs.readFile('/versionFile');
  let srcHash = crypto.createHash('sha256').update(versionFile).digest('hex');

  let tagName
  if (uploadRelease) {
    // latest few records, is that ok?
    let { data: releases } = await octokit.repos.listReleases({
      owner: owner,
      repo: repo,
    });

    let date = new Date().toISOString().split('T')[0];

    let exists = releases
      .filter(release => release.tag_name.startsWith(date))
      .map(release => parseInt(release.tag_name.split('-').pop()))

    let newVersion = 0;
    if (exists.length > 0) {
      newVersion = Math.max(...exists) + 1;
    }

    tagName = exists.length > 0 ? `${date}-${newVersion}` : date;

    // create new release
    let { data: release } = await octokit.repos.createRelease({
      owner: owner,
      repo: repo,
      tag_name: tagName,
      name: tagName,
      body: `automatic release`,
    });

    console.log(`Release ${tagName} created`)
  }

  for (const flavor of flavors) {
    let dir
    switch (osName) {
      case 'linux':
        dir = `/out/${flavor}`
        break;
      case 'windows':
        dir = `C:\\out\\${flavor}`
        break;
      case 'macos':
        dir = `build/out/${flavor}`
        break;
      default:
        // impossible
        throw `Unknown os ${os}`
    }
    for (const sapi of sapis) {
      let fileName = binFile[sapi]
      let debugName
      switch (osName) {
        case 'linux':
          debugName = fileName + '.debug'
          break;
        case 'windows':
          debugName = fileName.replace(/\..+?$/, '') + '.pdb'
          break;
        case 'macos':
          debugName = fileName + '.dwarf'
          break;
      }
      let filePath = `${dir}${sep}${fileName}`;
      try {
        await fs.access(filePath)
        console.log(`\x1b[37m;File ${filePath} found\x1b[0m;`)
        let artifactName
        switch (osName) {
          case 'linux':
            let _flavor = flavor.split('_').reverse().join('_')
            artifactName = `${sapi}_${_flavor}_${context.matrix.phpVer}_${context.matrix.libc}_${context.matrix.arch}_${srcHash}`
            break;
          case 'windows':
          // fall through
          case 'macos':
            artifactName = `${sapi}_${flavor}_${context.matrix.phpVer}_${context.matrix.arch}_${srcHash}`
            break;
        }

        artifacts[artifactName] = {
          'file': fileName,
          'debug': debugName,
          'dir': dir,
        };
        let shaSum = crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
        console.log(`\x1b[37m;File ${filePath} sha256: ${shaSum}\x1b[0m;`)
        await fs.writeFile(`${dir}${sep}sha256sums.txt`, `${shaSum}  ${fileName}\n`, { flag: 'a' })

        try {
          shaSum = crypto.createHash('sha256').update(await fs.readFile(debugName)).digest('hex')
          console.log(`\x1b[37m;File ${debugName} sha256: ${shaSum}\x1b[0m;`)
          await fs.writeFile(`${dir}${sep}sha256sums.txt`, `${shaSum}  ${debugName}\n`, { flag: 'a' })
        } catch (error) {
          // pass
        }
      } catch (error) {
        console.log(`\x1b[30m;File ${filePath} not found\x1b[0m;`)
      }
    }
  }

  for (const [name, info] of Object.entries(artifacts)) {
    let fileList = [
      'sha256sums.txt',
      'versionFile',
      'licenses',
      info.file,
    ];
    try {
      await fs.access(`${info.dir}${sep}${info.debug}`);
      fileList.push(`${info.debug}`);
    } catch (error) {
      // pass
    }

    try {
      console.log(`Uploading artifact ${name}`);
      let uploadResponse = artifactClient.uploadArtifact(name, fileList, info.dir);
      results[name] = uploadResponse;
      if (uploadRelease) {
        console.log(`Uploading artifact ${name} to release ${tagName}`);
        // compress files
        let filePath = `/tmp/${name}.tar.gz`;
        if (osName === 'windows') {
          filePath = `C:\\${name}.zip`;
        }
        // remove ${info.dir} suffix
        if (osName === 'windows') {
          await exec.exec('tar', '-cjvf', [filePath, ...fileList]);
        } else {
          await exec.exec(`zip`, [filePath, ...fileList]);
        }
        let { data: releaseAsset } = await octokit.repos.uploadReleaseAsset({
          owner: owner,
          repo: repo,
          release_id: release.id,
          name: filePath.split(sep).pop(),
          data: await fs.readFile(filePath),
        });
      }
    } catch (error) {
      core.setFailed(error.message);
    }
  }

  for (const [name, result] of Object.entries(results)) {
    let res = await result;
    console.log(`Artifact ${name} uploaded: ${res.artifactName}`);
  }

}

module.exports = {
  main
}


