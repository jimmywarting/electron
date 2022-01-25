if (!process.env.CI) require('dotenv-safe').load();

const assert = require('assert');
const fs = require('fs');
const got = require('got');
const path = require('path');

// Appveyor image constants | https://ci.appveyor.com/api/build-clouds/{buildCloudId}
const APPREVYOR_IMAGES_URL = 'https://ci.appveyor.com/api/build-clouds'; // GET
const BAKE_APPVEYOR_IMAGE_URL = 'https://ci.appveyor.com/api/builds'; // POST

async function makeRequest ({ auth, url, headers, body, method }) {
  const clonedHeaders = {
    ...(headers || {})
  };
  if (auth && auth.bearer) {
    clonedHeaders.Authorization = `Bearer ${auth.bearer}`;
  }
  const response = await got(url, {
    headers: clonedHeaders,
    body,
    method,
    auth: auth && (auth.username || auth.password) ? `${auth.username}:${auth.password}` : undefined
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    console.error('Error: ', `(status ${response.statusCode})`, response.body);
    throw new Error(`Unexpected status code ${response.statusCode} from ${url}`);
  }
  return JSON.parse(response.body);
}

async function checkAppVeyorImage (options) {
  const IMAGE_URL = `${APPREVYOR_IMAGES_URL}/${options.buildCloudId}`;
  const requestOpts = {
    url: IMAGE_URL,
    auth: {
      bearer: process.env.APPVEYOR_CLOUD_TOKEN
    },
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'GET'
  };

  try {
    const { settings } = await makeRequest(requestOpts, true);
    const { cloudSettings } = settings;
    return cloudSettings.images.find(image => image.name === `${options.imageVersion}`) || null;
  } catch (err) {
    console.log('Could not call AppVeyor: ', err);
  }
}

async function bakeAppVeyorImage (options) {
  const filepath = path.resolve(__dirname, '../appveyor.yml');
  const bakeConfigPath = path.resolve(__dirname, '../.circleci/configs/appveyor-bake.yml');

  const bakeConfig = fs.readFileSync(bakeConfigPath, 'utf8').replace('electron-DEPS-VERSION', `electron-${options.version}`);
  fs.writeFileSync(filepath, bakeConfig, (error) => {
    if (error) console.log(`Could not write new .yml file for AppVeyor: ${error}`);
    else console.log('AppVeyor configuration updated. Kicking off jobs...');
  });
}

async function useAppVeyorImage (options) {
  const filepath = path.resolve(__dirname, '../appveyor.yml');

  // const IMAGE = /'image': '(.+?)'/.exec(fs.readFileSync(filepath, 'utf8'));
  // console.log('IMAGE: ', IMAGE);
  // const contents = fs.readFileSync(filepath, 'utf8');

  const config = fs.readFileSync(filepath, 'utf8').replace('vs2019bt-16.6.2', options.version);
  fs.writeFileSync(filepath, config, (error) => {
    if (error) console.log(`Could not write new .yml file for AppVeyor: ${error}`);
    else console.log('AppVeyor configuration updated. Kicking off jobs...');
  });
}

async function prepareAppVeyorImage (opts) {
  // eslint-disable-next-line no-control-regex
  const versionRegex = new RegExp('chromium_version\':\n +\'(.+?)\',', 'm');
  const deps = fs.readFileSync(path.resolve(__dirname, '../DEPS'), 'utf8');
  const [, CHROMIUM_VERSION] = versionRegex.exec(deps);

  const buildCloudId = opts.buildCloudId || '1424'; // BC: electron-16-core2
  const imageVersion = opts.imageVersion || `electron-${CHROMIUM_VERSION}`;
  const image = await checkAppVeyorImage({ buildCloudId, imageVersion });

  if (image) {
    console.log(`Image exists for ${image}. Continuing AppVeyor jobs using ${buildCloudId}`);
    await useAppVeyorImage({ ...opts, version: image });
  } else {
    console.log(`No AppVeyor image found for ${imageVersion} in ${buildCloudId}.
                 Creating new image for ${imageVersion}, using Chromium ${CHROMIUM_VERSION} - job will run after image is baked.`);
    await bakeAppVeyorImage({ ...opts, version: CHROMIUM_VERSION });
    // TODO: Wait for image to fully bake before continuing
    // await useAppVeyorImage({ ...opts, version: imageVersion });
  }
}

module.exports = prepareAppVeyorImage;

if (require.main === module) {
  const args = require('minimist')(process.argv.slice(2));
  console.log('ARGS: ', args);
  const targetBranch = args._[0];
  // if (args._.length < 1) {
  //   console.log(`Load or bake AppVeyor images for Windows CI.
  //   Usage: prepare-appveyor.js [--buildCloudId=CLOUD_ID] [--appveyorJobId=xxx] [--imageVersion=xxx] [--commit=sha] TARGET_BRANCH`);
  //   process.exit(0);
  // }
  prepareAppVeyorImage(args)
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

// async function bakeAppVeyorImage (options) {
//   console.log(`Baking a new AppVeyor image for: ${options.version}, on build cloud ${options.buildCloudId}...`);

//   const environmentVariables = {
//     ELECTRON_RELEASE: 0,
//     APPVEYOR_BUILD_WORKER_CLOUD: options.buildCloudId,
//     APPVEYOR_BUILD_WORKER_IMAGE: options.version,
//     APPVEYOR_BAKE_IMAGE: options.version
//   };

//   const requestOpts = {
//     url: BAKE_APPVEYOR_IMAGE_URL,
//     auth: {
//       bearer: process.env.APPVEYOR_CLOUD_TOKEN
//     },
//     headers: {
//       'Content-Type': 'application/json'
//     },
//     body: JSON.stringify({
//       accountName: 'electron-bot',
//       commitId: options.commit || undefined,
//       environmentVariables
//     }),
//     method: 'POST'
//   };

//   try {
//     const res = await makeRequest(requestOpts, true);
//     // const bakeUrl = `https://ci.appveyor.com/project/electron-bot/${appVeyorJobs[job]}/build/${version}`;
//     // console.log(`AppVeyor release build request for ${job} successful.  Check build status at ${buildUrl}`);
//   } catch (err) {
//     console.log('Could not call AppVeyor: ', err);
//   }
// }

// TODO: Right now, this makes a manual API call to AppVeyor
// Change that to rewrite and return the AppVeyor .yaml
// async function useAppVeyorImage (options) {
//   console.log(`Using AppVeyor image ${options.version} on build cloud ${options.buildCloudId}...`);
//   const environmentVariables = {
//     ELECTRON_RELEASE: 1,
//     APPVEYOR_BUILD_WORKER_CLOUD: options.buildCloudId,
//     APPVEYOR_BUILD_WORKER_IMAGE: options.version
//   };

//   const requestOpts = {
//     url: BAKE_APPVEYOR_IMAGE_URL,
//     auth: {
//       bearer: process.env.APPVEYOR_CLOUD_TOKEN
//     },
//     headers: {
//       'Content-Type': 'application/json'
//     },
//     body: JSON.stringify({
//       accountName: 'electron-bot',
//       // projectSlug: appVeyorJobs[job],
//       // branch: targetBranch,
//       commitId: options.commit || undefined,
//       environmentVariables
//     }),
//     method: 'POST'
//   };

//   try {
//     const { version } = await makeRequest(requestOpts, true);
//     // const buildUrl = `https://ci.appveyor.com/project/electron-bot/${appVeyorJobs[job]}/build/${version}`;
//     // console.log(`AppVeyor release build request for ${job} successful.  Check build status at ${buildUrl}`);
//   } catch (err) {
//     console.log('Could not call AppVeyor: ', err);
//   }
// }
