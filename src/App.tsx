import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  Pin,
  Puzzle,
} from 'lucide-react';
import { buildVerifiedExtensionZip, triggerBlobDownload } from './lib/extensionArchive';

interface InstallStep {
  number: string;
  title: string;
  detail: string;
}

const INSTALL_STEPS: InstallStep[] = [
  {
    number: '01',
    title: 'Extract the downloaded ZIP file',
    detail:
      'Unpack the ZIP into a permanent folder on your computer before opening Chrome. Do not delete or move this folder later.',
  },
  {
    number: '02',
    title: 'Open Chrome Extensions & enable Developer mode',
    detail:
      'Paste chrome://extensions into Chrome’s address bar and turn on the Developer mode switch at the top right.',
  },
  {
    number: '03',
    title: 'Click Load unpacked & select the folder',
    detail:
      'Click Load unpacked at top left and pick the extracted folder directly containing the extension files (never pick the .zip file itself).',
  },
  {
    number: '04',
    title: 'Pin TypeMe to your Chrome toolbar',
    detail:
      'Click the puzzle icon next to the address bar and pin TypeMe so you can open it in one click anytime.',
  },
];

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'manifest-error',
    question: 'Chrome says the manifest file is missing when loading the folder.',
    answer:
      'Make sure you extracted the ZIP archive first. Open the extracted folder until you see the extension files inside, then select that inner folder with Load unpacked.',
  },
  {
    id: 'device-lock',
    question: 'Why does each computer show a different Device ID?',
    answer:
      'Licenses work on a One PC, One ID basis. On any new computer, open the TypeMe popup, click Copy next to your Device ID, send it for activation, then click Verify License Now.',
  },
  {
    id: 'update-zip',
    question: 'How do I update TypeMe when a new ZIP is released?',
    answer:
      'Download the new ZIP, extract it, replace the files in your existing TypeMe folder, and click the Reload icon on chrome://extensions.',
  },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function App() {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string>('manifest-error');
  const [zipStatus, setZipStatus] = useState<'idle' | 'building' | 'done' | 'error'>('idle');
  const [zipFeedback, setZipFeedback] = useState('');

  const handleDownloadZip = async () => {
    if (zipStatus === 'building') return;
    setZipStatus('building');
    setZipFeedback('Preparing extension package...');

    try {
      const result = await buildVerifiedExtensionZip();
      triggerBlobDownload(result.blob, 'TypeMe-Chrome-Extension.zip');
      setZipStatus('done');
      setZipFeedback(
        `Download started (${result.entryCount} files · ${formatFileSize(result.bytes)}). Extract the ZIP before loading in Chrome.`
      );
    } catch {
      const fallbackLink = document.createElement('a');
      fallbackLink.href = '/downloads/TypeMe-Chrome-Extension-Fixed.zip';
      fallbackLink.download = 'TypeMe-Chrome-Extension.zip';
      document.body.appendChild(fallbackLink);
      fallbackLink.click();
      fallbackLink.remove();
      setZipStatus('done');
      setZipFeedback(
        'Download started. Extract the ZIP before loading it inside chrome://extensions.'
      );
    }
  };

  const handleCopyExtensionsUrl = async () => {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      setCopiedAddress(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Minimal header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-8 px-6 py-3.5">
          <a
            href="#top"
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
          >
            <img
              src="/extension-icons/icon48.png"
              alt="TypeMe logo"
              className="h-6 w-6 rounded-md object-cover"
            />
            TypeMe
          </a>

          <div className="flex items-center shrink-0">
            <a
              href="https://t.me/APKBrainKillerofficial"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Support
              <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero with the single primary Download button */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-12 lg:py-16">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-medium text-slate-500">
                  Chrome Extension · Version 2.6 · Windows &amp; macOS
                </p>

                <h1 className="mt-3 text-[clamp(2rem,3.8vw,3rem)] font-bold leading-[1.12] tracking-tight text-slate-900 [text-wrap:balance]">
                  Simple setup for your TypeMe Chrome Extension.
                </h1>

                <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600">
                  Download the ZIP package once, extract the folder, load it inside Chrome
                  Extensions, and activate your Device ID.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    disabled={zipStatus === 'building'}
                    className="inline-flex min-h-[44px] items-center gap-2.5 rounded-lg bg-emerald-700 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {zipStatus === 'building' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {zipStatus === 'building'
                      ? 'Preparing ZIP...'
                      : 'Download Extension (.zip)'}
                  </button>

                  <a
                    href="#install"
                    className="inline-flex min-h-[44px] items-center gap-1.5 px-2 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                  >
                    How to install
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>

                {zipFeedback && (
                  <p className="mt-4 text-xs font-medium text-emerald-800" role="status">
                    {zipFeedback}
                  </p>
                )}
              </div>

              {/* Authentic TypeMe Extension Popup Preview */}
              <div className="lg:col-span-6 flex justify-center lg:justify-end">
                <div className="w-full max-w-[360px] rounded-xl border border-slate-800 bg-[#090d16] p-5 text-slate-100 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <img
                        src="/extension-icons/icon48.png"
                        alt="TypeMe extension icon"
                        className="h-7 w-7 rounded-md object-cover"
                      />
                      <span className="text-sm font-bold text-white">TypeMe</span>
                    </div>
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                      Active
                    </span>
                  </div>

                  <div className="mt-3.5 rounded-lg border border-slate-800 bg-[#0f172a] p-3">
                    <p className="text-[11px] font-semibold text-slate-400">
                      Machine Device ID (1-PC Lock)
                    </p>
                    <div className="mt-1.5 flex items-center justify-between rounded-md border border-slate-700 bg-[#040711] px-2.5 py-2 font-mono text-xs font-bold text-emerald-400">
                      <span>TM-XXXX-XXXX-XXXX</span>
                      <span className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 font-sans text-[11px] font-medium text-slate-200">
                        Copy
                      </span>
                    </div>
                    <div className="mt-2.5 rounded-md bg-slate-800/50 px-2.5 py-2 text-xs font-semibold text-emerald-400">
                      ✓ Active &amp; Authorized
                    </div>
                  </div>

                  <div className="mt-2.5 rounded-md bg-emerald-500 py-2.5 text-center text-xs font-bold text-[#090d16]">
                    ▶ Launch on Current Tab
                  </div>

                  <div className="mt-2.5 flex items-center justify-between rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Auto-Run on Refresh</p>
                      <p className="text-[10px] text-slate-400">Auto-starts on page reload</p>
                    </div>
                    <div className="flex h-5 w-9 items-center justify-end rounded-full bg-emerald-500 p-0.5">
                      <span className="h-4 w-4 rounded-full bg-white" />
                    </div>
                  </div>

                  <div className="mt-2 rounded-md border border-slate-700 bg-slate-800 py-2 text-center text-xs font-semibold text-slate-200">
                    License Active (Verified)
                  </div>

                  <p className="mt-2.5 text-center font-mono text-[10px] text-slate-500">
                    One PC, One ID
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Simple 4-step Installation Guide */}
        <section id="install" className="mx-auto max-w-5xl px-6 py-14 lg:py-16">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl [text-wrap:balance]">
              How to install in 4 steps
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Follow these steps once after downloading the ZIP file.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 rounded-xl border border-slate-200 bg-white p-6 lg:grid-cols-12 lg:items-stretch lg:p-8">
            <ol className="lg:col-span-7 divide-y divide-slate-100">
              {INSTALL_STEPS.map((step) => (
                <li key={step.number} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3.5">
                    <span className="font-mono text-xs font-bold text-emerald-700 pt-1 tabular-nums shrink-0">
                      {step.number}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.detail}</p>
                      {step.number === '02' && (
                        <div className="mt-3 flex flex-wrap items-center gap-2.5">
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-800">
                            chrome://extensions
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyExtensionsUrl}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {copiedAddress ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy link
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            {/* Chrome Extensions Window & Folder Diagram */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <span className="font-mono text-xs text-slate-600">chrome://extensions</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">Developer mode</span>
                    <span className="inline-flex h-4 w-7 items-center justify-end rounded-full bg-blue-600 p-0.5">
                      <span className="h-3 w-3 rounded-full bg-white" />
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700">
                    Load unpacked
                  </span>
                  <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                    Pack extension
                  </span>
                  <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                    Update
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-900">
                  <FolderOpen className="h-4 w-4 text-emerald-700" />
                  <span>Select the extracted folder</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  After extracting <span className="font-mono text-slate-800">TypeMe-Chrome-Extension.zip</span>, choose the unpacked folder directly—never select the compressed `.zip` file.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Activation & Daily Use */}
        <section id="activation" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-14 lg:py-16">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7 flex flex-col justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl [text-wrap:balance]">
                    Activate your ID &amp; launch
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Each computer uses its own Device ID (One PC, One ID). Once approved, TypeMe
                    unlocks right inside the Chrome popup.
                  </p>

                  <ol className="mt-6 space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-3">
                      <span className="font-mono text-xs font-bold text-slate-900 pt-0.5 tabular-nums">
                        01.
                      </span>
                      <span>
                        Open the TypeMe popup and click{' '}
                        <span className="font-semibold text-slate-900">Copy</span> next to your
                        Device ID.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="font-mono text-xs font-bold text-slate-900 pt-0.5 tabular-nums">
                        02.
                      </span>
                      <span>
                        Send that ID to{' '}
                        <a
                          href="https://t.me/APKBrainKillerofficial"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-emerald-800 underline underline-offset-4 hover:text-emerald-900"
                        >
                          @APKBrainKillerofficial on Telegram
                        </a>{' '}
                        to activate it.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="font-mono text-xs font-bold text-slate-900 pt-0.5 tabular-nums">
                        03.
                      </span>
                      <span>
                        Click{' '}
                        <span className="font-semibold text-slate-900">Verify License Now</span>,
                        then press{' '}
                        <span className="font-semibold text-slate-900">Launch on Current Tab</span>{' '}
                        on any supported website.
                      </span>
                    </li>
                  </ol>
                </div>

                <div
                  id="daily-use"
                  className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Manual Launch</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Open your target page, click the TypeMe icon, and press Launch on Current Tab.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Auto-Run on Refresh</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Keep Auto-Run enabled inside the popup to start automatically on supported
                      pages, or switch it off anytime.
                    </p>
                  </div>
                </div>
              </div>

              {/* Chrome Toolbar Pin Preview */}
              <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2 rounded-md bg-slate-100 px-3 py-2">
                    <span className="truncate font-mono text-xs text-slate-500">
                      https://www.facebook.com/...
                    </span>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <img
                        src="/extension-icons/icon48.png"
                        alt="Pinned TypeMe toolbar icon"
                        className="h-5 w-5 rounded object-cover"
                      />
                      <Puzzle className="h-4 w-4 text-slate-600" />
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-slate-800">Extensions</p>
                    <div className="mt-2.5 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src="/extension-icons/icon48.png"
                          alt="TypeMe icon"
                          className="h-5 w-5 rounded object-cover"
                        />
                        <span className="text-xs font-semibold text-slate-900">TypeMe</span>
                      </div>
                      <Pin className="h-3.5 w-3.5 text-emerald-700" />
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  Pin TypeMe from the puzzle menu so the icon stays visible right beside your
                  address bar.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Short Help Section */}
        <section id="help" className="mx-auto max-w-3xl px-6 py-14 lg:py-16">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Common questions
          </h2>

          <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {FAQ_ITEMS.map((item) => {
              const isOpen = openFaqId === item.id;
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqId(isOpen ? '' : item.id)}
                    className="flex w-full min-h-[52px] items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-semibold text-slate-900">{item.question}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm leading-relaxed text-slate-600">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold text-slate-900">TypeMe</span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="text-xs text-slate-500">Chrome Extension Setup Guide</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
