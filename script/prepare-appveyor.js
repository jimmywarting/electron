if (!process.env.CI) require('dotenv-safe').load();

const assert = require('assert');
const fs = require('fs');
const got = require('got');
const path = require('path');

// Appveyor image constants
// https://ci.appveyor.com/api/build-clouds/{buildCloudId}
const APPREVYOR_IMAGES_URL = 'https://ci.appveyor.com/api/build-clouds'; // GET
const BAKE_APPVEYOR_IMAGE_URL = 'https://ci.appveyor.com/api/builds'; // POST
const USE_APPVEYOR_IMAGE_URL = 'https://ci.appveyor.com/api/builds'; // POST

async function checkAppVeyorImage (opts) {
  // check the image for the available chromium number
  // eslint-disable-next-line no-control-regex
  const versionRegex = new RegExp('chromium_version\':\n +\'(.+?)\',', 'm');
  const deps = fs.readFileSync(path.resolve(__dirname, '../DEPS'), 'utf8');
  const [, CHROMIUM_VERSION] = versionRegex.exec(deps);

  const IMAGE_URL = `${APPREVYOR_IMAGES_URL}/${opts.buildCloudId}`;
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
    // const res = await makeRequest(requestOpts, true);
    const { settings } = await makeRequest(requestOpts, true);
    const { cloudSettings } = settings;
    console.log('cloudSettings: ', cloudSettings);

    const version = cloudSettings.images.find(image => image.name === `${CHROMIUM_VERSION}`) || null;
    if (version) {
      console.log(`Image exists for ${CHROMIUM_VERSION}. Continuing AppVeyor jobs using ${opts.buildCloudId}`);
    } else {
      console.log(`No AppVeyor image found for ${CHROMIUM_VERSION} in ${opts.buildCloudId}. Creating new image...`);
      await bakeAppVeyorImage({ ...opts, version: CHROMIUM_VERSION });
      // should we continue with an older cached image here?
      // await useAppVeyorImage(opts);
    }
  } catch (err) {
    console.log('Could not call AppVeyor: ', err);
  }
}

async function bakeAppVeyorImage (options) {
  console.log(`Triggering a new AppVeyor image for: ${options.version} on build cloud: ${options.buildCloudId}...`);
  const environmentVariables = {
    ELECTRON_RELEASE: 0,
    APPVEYOR_BUILD_WORKER_CLOUD: options.buildCloudId,
    APPVEYOR_BUILD_WORKER_IMAGE: options.version
  };

  if (!options.ghRelease) {
    environmentVariables.UPLOAD_TO_S3 = 1;
  }

  const requestOpts = {
    url: BAKE_APPVEYOR_IMAGE_URL,
    auth: {
      bearer: process.env.APPVEYOR_CLOUD_TOKEN
    },
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountName: 'electron-bot',
      // projectSlug: appVeyorJobs[job],
      // branch: targetBranch,
      commitId: options.commit || undefined,
      environmentVariables
    }),
    method: 'POST'
  };
  // jobRequestedCount++;

  try {
    const { version } = await makeRequest(requestOpts, true);
    // const buildUrl = `https://ci.appveyor.com/project/electron-bot/${appVeyorJobs[job]}/build/${version}`;
    // console.log(`AppVeyor release build request for ${job} successful.  Check build status at ${buildUrl}`);
  } catch (err) {
    console.log('Could not call AppVeyor: ', err);
  }
}

// TODO: We'll need to replace the webhook that calls current AppVeyor builds with a call to this function
async function useAppVeyorImage (targetBranch, job, options) {
  console.log(`Triggering AppVeyor to run build job: ${job} on branch: ${targetBranch} with release flag.`);
  const environmentVariables = {
    ELECTRON_RELEASE: 1,
    APPVEYOR_BUILD_WORKER_CLOUD: options.buildCloudId,
    APPVEYOR_BUILD_WORKER_IMAGE: options.version
  };

  if (!options.ghRelease) {
    environmentVariables.UPLOAD_TO_S3 = 1;
  }

  const requestOpts = {
    url: USE_APPVEYOR_IMAGE_URL,
    auth: {
      bearer: process.env.APPVEYOR_CLOUD_TOKEN
    },
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountName: 'electron-bot',
      // projectSlug: appVeyorJobs[job],
      // branch: targetBranch,
      commitId: options.commit || undefined,
      environmentVariables
    }),
    method: 'POST'
  };
  // jobRequestedCount++;

  try {
    const { version } = await makeRequest(requestOpts, true);
    // const buildUrl = `https://ci.appveyor.com/project/electron-bot/${appVeyorJobs[job]}/build/${version}`;
    // console.log(`AppVeyor release build request for ${job} successful.  Check build status at ${buildUrl}`);
  } catch (err) {
    console.log('Could not call AppVeyor: ', err);
  }
}

// Helpers
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

checkAppVeyorImage({ buildCloudId: '682', version: 'vs2019bt-16.4.0' });
