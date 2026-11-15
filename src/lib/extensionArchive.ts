import JSZip from 'jszip';

import readmeTxt from '../../extension/README.txt?raw';
import manifestJson from '../../extension/manifest.json?raw';
import rulesJson from '../../extension/rules.json?raw';
import popupHtml from '../../extension/popup.html?raw';
import popupJs from '../../extension/popup.js?raw';
import contentJs from '../../extension/content.js?raw';
import backgroundJs from '../../extension/background.js?raw';

export interface ExtensionFileEntry {
  name: string;
  content: string;
  patched: boolean;
  description: string;
}

export const EXTENSION_TEXT_FILES: ExtensionFileEntry[] = [
  {
    name: 'background.js',
    content: backgroundJs,
    patched: true,
    description: 'Serialized 3-stage remote loader, automatic tab refresh fallback, and MAIN-world injection.',
  },
  {
    name: 'content.js',
    content: contentJs,
    patched: true,
    description: 'Routes auto-start through background MAIN-world injector.',
  },
  {
    name: 'popup.js',
    content: popupJs,
    patched: true,
    description: 'Serialized verification, clean lock screen states, and seamless launch.',
  },
  {
    name: 'popup.html',
    content: popupHtml,
    patched: true,
    description: 'Extension popup interface.',
  },
  {
    name: 'manifest.json',
    content: manifestJson,
    patched: true,
    description: 'Clean Chrome Manifest V3 configuration with static header rules.',
  },
  {
    name: 'rules.json',
    content: rulesJson,
    patched: true,
    description: 'Static browser rules loaded immediately at startup.',
  },
  {
    name: 'README.txt',
    content: readmeTxt,
    patched: false,
    description: 'Installation instructions.',
  },
];

export async function buildVerifiedExtensionZip(): Promise<{
  blob: Blob;
  bytes: number;
  entryCount: number;
}> {
  const zip = new JSZip();

  for (const file of EXTENSION_TEXT_FILES) {
    zip.file(file.name, file.content);
  }

  const iconsFolder = zip.folder('icons');
  const iconNames = ['icon16.png', 'icon48.png', 'icon128.png'];

  if (iconsFolder) {
    for (const iconName of iconNames) {
      const res = await fetch(`/extension-icons/${iconName}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load ${iconName} (${res.status})`);
      }
      const buffer = await res.arrayBuffer();
      const sig = new Uint8Array(buffer.slice(0, 4));
      if (
        buffer.byteLength === 0 ||
        sig[0] !== 0x89 ||
        sig[1] !== 0x50 ||
        sig[2] !== 0x4e ||
        sig[3] !== 0x47
      ) {
        throw new Error(`Icon ${iconName} returned invalid PNG data`);
      }
      iconsFolder.file(iconName, buffer);
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
    mimeType: 'application/zip',
  });

  // Self-verify archive integrity before handing it to the browser download manager
  const headerBytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (headerBytes[0] !== 0x50 || headerBytes[1] !== 0x4b || headerBytes[2] !== 0x03 || headerBytes[3] !== 0x04) {
    throw new Error('Generated ZIP failed PK header verification.');
  }

  const verifiedZip = await JSZip.loadAsync(blob);
  const entryNames = Object.keys(verifiedZip.files).filter((k) => !verifiedZip.files[k].dir);
  if (entryNames.length !== EXTENSION_TEXT_FILES.length + iconNames.length) {
    throw new Error(`ZIP integrity check mismatch (${entryNames.length} files found).`);
  }

  return {
    blob,
    bytes: blob.size,
    entryCount: entryNames.length,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
