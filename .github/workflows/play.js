const fs = require('fs/promises');
const crypto = require('crypto');

const core = require('@actions/core');
const github = require('@actions/github');
const artifact = require('@actions/artifact');
const exec = require('@actions/exec');

const matrix = github.context.matrix
const uploadRelease = core.getInput('uploadRelease') != '';
const octokit = github.getOctokit('');

const sapis = matrix.sapis
const flavors = matrix.flavors
const binFile = {
  'micro': 'micro.sfx',
  'micro-cli': 'micro_cli.sfx',
  'cli': 'php',
}

async function main() {
  let client = artifact.create()

  let artifacts = {};
  let results = {};

  let versionFile = await fs.readFile('/versionFile');
  let srcHash = crypto.createHash('sha256').update(versionFile).digest('hex');

  let tagName
  if (uploadRelease) {
    // latest few records is ok ?
    let { data: releases } = await octokit.repos.listReleases({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
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
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      tag_name: tagName,
      name: tagName,
      body: `automatic release`,
    });
  }

  for (const flavor of flavors) {
    for (const staticOrShared of ['static', 'shared']) {
      let dir = `/out/${flavor}_${staticOrShared}`;
      for (const sapi of sapis) {
        let binPath = `${dir}/${binFile[sapi]}`;
        try {
          await fs.access(binPath)
          console.log(`\x1b[37m;File ${binPath} found\x1b[0m;`)
          let artifactName = `${sapi}_${staticOrShared}_${flavor}_${matrix.phpVer}_${matrix.libc}_${matrix.arch}_${srcHash}`;
          artifacts[artifactName] = {
            'file': binPath,
            'dir': dir,
          };
          let shaSum = crypto.createHash('sha256').update(await fs.readFile(binPath)).digest('hex')
          console.log(`\x1b[37m;File ${binPath} sha256: ${shaSum}\x1b[0m;`)
          await fs.writeFile(`${dir}/sha256sums.txt`, `${shaSum}  ${binFile[sapi]}\n`, { flag: 'a' })
          try {
            shaSum = crypto.createHash('sha256').update(await fs.readFile(`${binPath}.debug`)).digest('hex')
            console.log(`\x1b[37m;File ${binPath}.debug sha256: ${shaSum}\x1b[0m;`)
            await fs.writeFile(`${dir}/sha256sums.txt`, `${shaSum}  ${binFile[sapi]}.debug\n`, { flag: 'a' })
          } catch (error) {
            // pass
          }
        } catch (error) {
          console.log(`\x1b[30m;File ${binPath} not found\x1b[0m;`)
        }
      }
    }
  }

  for (const [name, info] of Object.entries(artifacts)) {
    let fileList = [
      `${info.dir}/sha256sums.txt`,
      info.file,
    ];
    try {
      await fs.access(`${info.file}.debug`);
      fileList.push(`${info.file}.debug`);
    } catch (error) {
      // pass
    }
    try {
      for (const file of await fs.readdir(`${info.dir}/licenses`)) {
        fileList.push(`${info.dir}/licenses/${file}`);
      }
    } catch (error) {
      console.log(`Directory ${info.dir}/licenses not found`);
    }
    fileList.push(`${info.dir}/versionFile`);

    try {
      console.log(`Uploading artifact ${name}`);
      let uploadResponse = client.uploadArtifact(name, fileList, info.dir);
      results[name] = uploadResponse;
      if (uploadRelease) {
        console.log(`Uploading artifact ${name} to release ${tagName}`);
        // zip files
        let zipFile = `/tmp/${name}.zip`;
        // remove ${info.dir} suffix
        await exec.exec(`zip`, ['-j', zipFile, ...fileList.map(file => file.replace(`${info.dir}/`, ''))]);
        let { data: releaseAsset } = await octokit.repos.uploadReleaseAsset({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          release_id: release.id,
          name: `${name}.zip`,
          data: await fs.readFile(zipFile),
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

main().catch(err => core.setFailed(err.message));