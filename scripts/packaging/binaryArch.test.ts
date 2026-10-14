import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

interface BinaryArch {
  binaryArch(header: Buffer): string | null;
  acceptedArches(targetArch: string): string[];
  archMismatches(targetArch: string, binaries: { name: string; header: Buffer }[]): string[];
}

const { binaryArch, acceptedArches, archMismatches } = createRequire(import.meta.url)(
  './binaryArch.cjs',
) as BinaryArch;

function machO(cpuType: number): Buffer {
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0);
  header.writeUInt32LE(cpuType, 4);
  return header;
}

function pe(machine: number): Buffer {
  const header = Buffer.alloc(0x100);
  header.write('MZ', 0, 'latin1');
  header.writeUInt32LE(0x80, 0x3c);
  header.write('PE\0\0', 0x80, 'latin1');
  header.writeUInt16LE(machine, 0x84);
  return header;
}

const MACHO_X64 = machO(0x01000007);
const MACHO_ARM64 = machO(0x0100000c);
const PE_X64 = pe(0x8664);
const PE_ARM64 = pe(0xaa64);

describe('binaryArch', () => {
  it('reads the CPU type of 64-bit Mach-O executables', () => {
    expect(binaryArch(MACHO_X64)).toBe('x64');
    expect(binaryArch(MACHO_ARM64)).toBe('arm64');
  });

  it('reads the machine type of PE executables', () => {
    expect(binaryArch(PE_X64)).toBe('x64');
    expect(binaryArch(PE_ARM64)).toBe('arm64');
  });

  it('returns null for anything it does not recognise', () => {
    expect(binaryArch(Buffer.from('#!/bin/sh\necho hi\n'))).toBeNull();
    expect(binaryArch(Buffer.alloc(0))).toBeNull();
  });
});

describe('acceptedArches', () => {
  it('accepts only x64 binaries in an x64 package', () => {
    expect(acceptedArches('x64')).toEqual(['x64']);
  });

  it('also accepts x64 binaries in an arm64 package, which Rosetta and Windows on Arm emulate', () => {
    expect(acceptedArches('arm64')).toEqual(['arm64', 'x64']);
  });
});

describe('archMismatches', () => {
  it('passes when every binary runs on the target', () => {
    const binaries = [
      { name: 'ffmpeg', header: MACHO_ARM64 },
      { name: 'ffprobe', header: MACHO_X64 },
    ];
    expect(archMismatches('arm64', binaries)).toEqual([]);
  });

  it('names a host-arch FFmpeg bundled into an x64 package built on Apple Silicon', () => {
    const binaries = [
      { name: 'ffmpeg', header: MACHO_ARM64 },
      { name: 'ffprobe', header: MACHO_X64 },
    ];
    expect(archMismatches('x64', binaries)).toEqual(['ffmpeg is arm64, expected x64']);
  });

  it('accepts x64 binaries in a Windows arm64 package', () => {
    const binaries = [{ name: 'ffmpeg.exe', header: PE_X64 }];
    expect(archMismatches('arm64', binaries)).toEqual([]);
  });

  it('flags binaries it cannot identify', () => {
    const binaries = [{ name: 'ffmpeg', header: Buffer.alloc(8) }];
    expect(archMismatches('arm64', binaries)).toEqual(['ffmpeg is unknown, expected arm64 or x64']);
  });
});
