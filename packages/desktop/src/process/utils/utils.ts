/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlatformServices } from '@/common/platform';
import { getEnvAwareName } from '@/common/config/appEnv';
import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
export const hasElectronAppPath = (): boolean => {
  return typeof process.versions.electron === 'string';
};

const getElectronPathOrFallback = (name: 'temp' | 'home' | 'userData'): string => {
  const paths = getPlatformServices().paths;
  switch (name) {
    case 'temp':
      return paths.getTempDir();
    case 'home':
      return paths.getHomeDir();
    case 'userData':
      return paths.getDataDir();
  }
};

export const getTempPath = () => {
  const rootPath = getElectronPathOrFallback('temp');
  return path.join(rootPath, 'aionui');
};

/**
 * Ensure CLI-safe symlink exists and return the symlink path.
 * On macOS, creates a symlink in home directory to avoid spaces in paths.
 * CLI tools like Qwen can't handle spaces in paths properly.
 *
 * 确保 CLI 安全符号链接存在并返回符号链接路径。
 * 在 macOS 上，在用户目录创建符号链接以避免路径中的空格。
 * CLI 工具如 Qwen 无法正确处理路径中的空格。
 */
const ensureCliSafeSymlink = (targetPath: string, symlinkName: string): string => {
  // Only needed when the platform explicitly requires CLI-safe symlinks
  // (Electron on macOS, where userData lives under "Application Support" which contains spaces)
  if (!getPlatformServices().paths.needsCliSafeSymlinks()) {
    return targetPath;
  }

  const homePath = getElectronPathOrFallback('home');
  const symlinkPath = path.join(homePath, symlinkName);

  // Ensure symlink exists
  try {
    const stats = lstatSync(symlinkPath);
    if (stats.isSymbolicLink()) {
      // Symlink exists, verify it points to the correct location
      const target = readlinkSync(symlinkPath);
      if (target === targetPath) {
        // Ensure the target directory still exists (broken symlink if deleted, #841)
        if (!existsSync(targetPath)) {
          mkdirSync(targetPath, { recursive: true });
        }
        return symlinkPath;
      }
      // Wrong target, remove and recreate
      unlinkSync(symlinkPath);
    } else if (stats.isDirectory()) {
      // Real directory exists, don't touch it
      return targetPath;
    } else {
      // Regular file blocking the symlink path (#841), remove it
      unlinkSync(symlinkPath);
    }
  } catch {
    // Symlink doesn't exist, create it
  }

  try {
    // Ensure the target directory exists first
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }
    symlinkSync(targetPath, symlinkPath);
    return symlinkPath;
  } catch (error) {
    return targetPath;
  }
};

/**
 * Get data path, using CLI-safe symlink on macOS.
 * Release builds use ~/.aionui; dev builds use ~/.aionui-dev.
 * 获取数据目录路径，macOS 上使用符号链接。
 * Release 使用 ~/.aionui，Dev 模式使用 ~/.aionui-dev。
 */
export const getDataPath = (): string => {
  const rootPath = getElectronPathOrFallback('userData');
  const dataPath = path.join(rootPath, 'aionui');
  return ensureCliSafeSymlink(dataPath, getEnvAwareName('.aionui'));
};

/**
 * Get config path, using CLI-safe symlink on macOS.
 * Release builds use ~/.aionui-config; dev builds use ~/.aionui-config-dev.
 * 获取配置目录路径，macOS 上使用符号链接。
 * Release 使用 ~/.aionui-config，Dev 模式使用 ~/.aionui-config-dev。
 */
export const getConfigPath = (): string => {
  const rootPath = getElectronPathOrFallback('userData');
  const configPath = path.join(rootPath, 'config');
  return ensureCliSafeSymlink(configPath, getEnvAwareName('.aionui-config'));
};

/**
 * Resolve a user-chosen path back to its CLI-safe symlink when it matches
 * the real target of a known default path.
 * On macOS the file picker resolves symlinks, so a round-trip migration
 * (away → back) would store the real path (with spaces) instead of the
 * symlink path. This function detects that and returns the symlink path.
 *
 * 当用户选择的路径与默认路径的真实目标相同时，返回 symlink 路径。
 * macOS 文件选择器会解析 symlink，导致来回迁移后存储的是带空格的真实路径。
 */
export const resolveCliSafePath = (inputPath: string, defaultPath: string): string => {
  try {
    const resolvedInput = realpathSync(path.resolve(inputPath));
    const resolvedDefault = realpathSync(path.resolve(defaultPath));
    if (resolvedInput === resolvedDefault) {
      return defaultPath;
    }
  } catch {
    // Path doesn't exist yet or can't be resolved — use as-is
  }
  return inputPath;
};

/**
 * 递归复制目录
 * 注意：包含路径验证，防止复制到自身或子目录导致无限递归（修复 Windows 下 cache 目录循环创建的 bug）
 */
interface CopyOptions {
  overwrite?: boolean;
}

export async function copyDirectoryRecursively(src: string, dest: string, options: CopyOptions = {}) {
  const { overwrite = true } = options;

  // 标准化路径：Windows 转小写（不区分大小写），Unix/macOS 保持原样（区分大小写）
  const isWindows = process.platform === 'win32';
  const normalizedSrc = isWindows ? path.resolve(src).toLowerCase() : path.resolve(src);
  const normalizedDest = isWindows ? path.resolve(dest).toLowerCase() : path.resolve(dest);

  // 防止复制到自身 (F:\code -> F:\code)
  if (normalizedSrc === normalizedDest) {
    throw new Error(`Cannot copy directory into itself: ${src}`);
  }

  // 防止复制到子目录 (F:\code -> F:\code\cache) - 会导致无限递归
  if (normalizedDest.startsWith(normalizedSrc + path.sep)) {
    throw new Error(`Cannot copy directory into its subdirectory: ${src} -> ${dest}`);
  }

  // 防止复制到父目录 (F:\code\cache -> F:\code)
  if (normalizedSrc.startsWith(normalizedDest + path.sep)) {
    throw new Error(`Cannot copy parent directory into child directory: ${src} -> ${dest}`);
  }

  if (!existsSync(dest)) {
    await fs.mkdir(dest, { recursive: true });
  }

  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!existsSync(destPath)) {
        await fs.mkdir(destPath, { recursive: true });
      }
      await copyDirectoryRecursively(srcPath, destPath, options);
    } else {
      // 如果不覆盖且目标文件已存在，跳过
      if (!overwrite && existsSync(destPath)) {
        continue;
      }
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// 验证两个目录的文件名结构是否相同
export async function verifyDirectoryFiles(dir1: string, dir2: string): Promise<boolean> {
  try {
    if (!existsSync(dir1) || !existsSync(dir2)) {
      return false;
    }

    const entries1 = await fs.readdir(dir1, { withFileTypes: true });
    const entries2 = await fs.readdir(dir2, { withFileTypes: true });

    if (entries1.length !== entries2.length) {
      return false;
    }

    entries1.sort((a, b) => a.name.localeCompare(b.name));
    entries2.sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < entries1.length; i++) {
      const entry1 = entries1[i];
      const entry2 = entries2[i];

      if (entry1.name !== entry2.name || entry1.isDirectory() !== entry2.isDirectory()) {
        return false;
      }

      if (entry1.isDirectory()) {
        const path1 = path.join(dir1, entry1.name);
        const path2 = path.join(dir2, entry2.name);
        if (!(await verifyDirectoryFiles(path1, path2))) {
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.warn('[AionUi] Error verifying directory files:', error);
    return false;
  }
}

export function ensureDirectory(dirPath: string): void {
  try {
    const stats = lstatSync(dirPath);
    if (stats.isDirectory()) {
      return;
    }
    if (stats.isSymbolicLink()) {
      // Verify symlink target actually exists (#841 - broken symlink)
      if (existsSync(dirPath)) {
        return;
      }
      // Broken symlink, remove so mkdirSync can work on the real path
      unlinkSync(dirPath);
    } else {
      // Regular file blocking the directory path (#841), remove it
      unlinkSync(dirPath);
    }
  } catch {
    // Path doesn't exist, create it
  }
  mkdirSync(dirPath, { recursive: true });
}
