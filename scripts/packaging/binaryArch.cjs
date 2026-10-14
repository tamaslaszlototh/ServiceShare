'use strict';

// ffmpeg-static downloads a binary for the host only, so a cross-arch package
// would silently ship the wrong FFmpeg. These helpers read the executable
// header to catch that at package time.

const MACHO_64_MAGIC = 0xfeedfacf;
const MACHO_CPU = { 0x01000007: 'x64', 0x0100000c: 'arm64' };
const PE_MACHINE = { 0x8664: 'x64', 0xaa64: 'arm64' };

function binaryArch(header) {
  if (header.length >= 8 && header.readUInt32LE(0) === MACHO_64_MAGIC) {
    return MACHO_CPU[header.readUInt32LE(4)] ?? null;
  }
  if (header.length >= 0x40 && header.toString('latin1', 0, 2) === 'MZ') {
    const pe = header.readUInt32LE(0x3c);
    if (header.length >= pe + 6 && header.toString('latin1', pe, pe + 4) === 'PE\0\0') {
      return PE_MACHINE[header.readUInt16LE(pe + 4)] ?? null;
    }
  }
  return null;
}

// An arm64 package may carry x64 binaries: macOS runs them under Rosetta and
// Windows on Arm emulates x64. ffmpeg-static has no win32-arm64 build and
// ffprobe-static ships an x64 binary for darwin-arm64. The reverse never runs.
function acceptedArches(targetArch) {
  return targetArch === 'arm64' ? ['arm64', 'x64'] : [targetArch];
}

function archMismatches(targetArch, binaries) {
  const accepted = acceptedArches(targetArch);
  return binaries
    .map(({ name, header }) => ({ name, actual: binaryArch(header) ?? 'unknown' }))
    .filter(({ actual }) => !accepted.includes(actual))
    .map(({ name, actual }) => `${name} is ${actual}, expected ${accepted.join(' or ')}`);
}

module.exports = { binaryArch, acceptedArches, archMismatches };
