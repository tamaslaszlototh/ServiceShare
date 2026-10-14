'use strict';

const { openSync, readSync, closeSync } = require('fs');
const path = require('path');
const { Arch } = require('electron-builder');
const { archMismatches } = require('./binaryArch.cjs');

function readHeader(file) {
  const fd = openSync(file, 'r');
  try {
    const header = Buffer.alloc(4096);
    const read = readSync(fd, header, 0, header.length, 0);
    return header.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

const PLATFORMS = {
  darwin: {
    ext: '',
    resourcesDir: (context) =>
      path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources'),
  },
  win32: { ext: '.exe', resourcesDir: (context) => path.join(context.appOutDir, 'resources') },
};

exports.default = async function afterPack(context) {
  const platform = PLATFORMS[context.electronPlatformName];
  if (!platform) {
    return;
  }
  const binaries = ['ffmpeg', 'ffprobe'].map((tool) => {
    const name = tool + platform.ext;
    return { name, header: readHeader(path.join(platform.resourcesDir(context), name)) };
  });
  const problems = archMismatches(Arch[context.arch], binaries);
  if (problems.length > 0) {
    throw new Error(
      `Bundled FFmpeg does not match the ${Arch[context.arch]} package: ${problems.join('; ')}. ` +
        'Package each architecture on a matching runner (see README "Packaging").',
    );
  }
};
