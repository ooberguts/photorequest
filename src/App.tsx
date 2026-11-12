import { useEffect, useRef, useState } from 'react';
import { BUILD } from './lib/build';
import AppUpdates from './components/AppUpdates';
import OrderCart from './components/OrderCart';
import GuidedOrder from './components/GuidedOrder';
import PaperCatalogManager from './components/PaperCatalog';
import {
  CATALOG_KEY,
  MAX_CATALOG_BYTES,
  loadCatalog,
  parseCatalog,
  serializeCatalog,
  type PaperCatalog,
} from './lib/papers';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Aperture,
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  CloudOff,
  FileJson,
  FolderOpen,
  ImagePlus,
  Images,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Package,
  Plus,
  Printer,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import PhotoEditor from './components/PhotoEditor';
import PrintDesk from './components/PrintDesk';
import Guide from './components/Guide';
import {
  effectiveDpi,
  finishLabel,
  formatBytes,
  LIMITS,
  newOrder,
  photoName,
  quality,
  safeName,
  sizeLabel,
  stats,
  requestSchema,
  type Order,
  type Photo,
  type PrintRequest,
} from './lib/model';
import { readPhoto, releasePhotos, samplePhotos } from './lib/images';
import { exportOrder, importOrder } from './lib/package';
import { loadDraft, saveDraft } from './lib/storage';
import { saveFile } from './lib/files';

type View = 'studio' | 'print' | 'guide' | 'papers';
type Confirmation = {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  action: () => void;
  cancel?: () => void;
};
function Confirm({ value, onClose }: { value: Confirmation; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="confirm-dialog"
      ref={ref}
      onCancel={() => {
        value.cancel?.();
        onClose();
      }}
      aria-labelledby="confirm-title"
    >
      <button
        className="icon-button confirm-close"
        aria-label="Cancel"
        onClick={() => {
          value.cancel?.();
          onClose();
        }}
      >
        <X size={19} />
      </button>
      <div className={`empty-icon ${value.danger ? 'danger' : ''}`}>
        <Archive size={26} />
      </div>
      <h2 id="confirm-title">{value.title}</h2>
      <p>{value.body}</p>
      <div className="confirm-actions">
        <button
          className="button secondary"
          onClick={() => {
            value.cancel?.();
            onClose();
          }}
        >
          Cancel
        </button>
        <button
          className={`button ${value.danger ? 'danger-button' : 'primary'}`}
          onClick={() => {
            onClose();
            value.action();
          }}
        >
          {value.label}
        </button>
      </div>
    </dialog>
  );
}

export default function App() {
  const [order, setOrderValue] = useState<Order>(newOrder);
  const [view, setView] = useState<View>('studio');
  const [guided, setGuided] = useState(
    () => localStorage.getItem('photorequest-order-mode') !== 'all',
  );
  const [catalog, setCatalog] = useState<PaperCatalog | null>(null);
  const catalogInput = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState('Opening local draft…');
  const [completed, setCompletedValue] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [units, setUnits] = useState<'in' | 'mm'>('in');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string[]>([]);
  const [editorMode, setEditorMode] = useState<{ initialRequestId?: string; addSize?: boolean }>(
    {},
  );
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [dragging, setDragging] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null),
    zipInput = useRef<HTMLInputElement>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveRevision = useRef(0);
  const currentOrder = useRef(order);
  currentOrder.current = order;
  const latestDraft = useRef({ order, completed });
  latestDraft.current = { order, completed };
  const summary = stats(order);
  function setOrder(value: Parameters<typeof setOrderValue>[0]) {
    setSaved('Saving draft…');
    setOrderValue(value);
  }
  function setCompleted(value: Parameters<typeof setCompletedValue>[0]) {
    setSaved('Saving draft…');
    setCompletedValue(value);
  }
  useEffect(() => {
    try {
      setCatalog(loadCatalog());
    } catch {
      setToast({
        message:
          'The saved paper list could not be read. Import a paper list again; your order is unchanged.',
        error: true,
      });
    }
  }, []);
  function saveCatalog(value: PaperCatalog) {
    try {
      const json = serializeCatalog(value);
      if (new TextEncoder().encode(json).byteLength > MAX_CATALOG_BYTES)
        throw new Error('The paper list exceeds 1 MB. Shorten the notes or use fewer entries.');
      localStorage.setItem(CATALOG_KEY, json);
      setCatalog(parseCatalog(json));
      return true;
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'The paper list could not be saved.',
        error: true,
      });
      return false;
    }
  }
  async function importCatalog(file: File) {
    await run('Reading paper list…', async () => {
      if (file.size > MAX_CATALOG_BYTES) throw new Error('Choose a paper list smaller than 1 MB.');
      const next = parseCatalog(await file.text());
      setConfirmation({
        title: 'Load this printer’s paper list?',
        body: `${next.name}${next.printerName ? ` from ${next.printerName}` : ''}: ${next.papers.filter((p) => p.available).length} available paper types, costs in ${next.currency}. This replaces the paper list on this computer. Existing orders keep their saved paper choices.`,
        label: 'Use paper list',
        action: () => {
          if (saveCatalog(next))
            setToast({
              message: 'Paper list loaded. Choose a paper in your print settings.',
              error: false,
            });
        },
      });
    });
  }

  useEffect(() => {
    let cancelled = false;
    loadDraft()
      .then((draft) => {
        if (cancelled) {
          if (draft) releasePhotos(draft.order.photos);
          return;
        }
        if (draft) {
          setOrder(draft.order);
          setCompleted(draft.completed);
        }
      })
      .catch(() => {
        if (!cancelled)
          setToast({
            message:
              'Your saved draft could not be restored. You can open a previously exported ZIP.',
            error: true,
          });
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    setSaved('Saving draft…');
    const revision = ++saveRevision.current;
    saveChain.current = saveChain.current.catch(() => {}).then(() => saveDraft(order, completed));
    saveChain.current
      .then(() => {
        if (revision === saveRevision.current) setSaved('Draft saved on this device');
      })
      .catch(() => {
        setSaved('Draft not saved — export a ZIP');
        setToast({
          message: 'Local storage could not save your draft. Export a ZIP to keep a backup.',
          error: true,
        });
      });
  }, [order, completed, hydrated]);
  useEffect(() => {
    if (!hydrated || !isTauri()) return;
    let disposed = false;
    const cleanup = getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          await saveChain.current.catch(() => {});
          await saveDraft(latestDraft.current.order, latestDraft.current.completed);
          await getCurrentWindow().destroy();
        } catch {
          setToast({
            message: 'The draft could not be saved. Export a ZIP before closing the app.',
            error: true,
          });
        }
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        return unlisten;
      });
    return () => {
      disposed = true;
      void cleanup.then((unlisten) => unlisten());
    };
  }, [hydrated]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        error: true,
      });
    } finally {
      setBusy('');
    }
  }
  function updateOrder(patch: Partial<Order>) {
    setOrder((o) => ({ ...o, ...patch }));
  }
  function replaceOrder(next: Order) {
    releasePhotos(currentOrder.current.photos);
    setOrder(next);
    setSelected(new Set());
    setCompleted([]);
    setEditing([]);
  }
  function makeSample() {
    void run('Creating a sample order…', async () => {
      replaceOrder({
        ...newOrder(),
        name: 'Sample print order',
        customer: 'Sample customer',
        photos: await samplePhotos(),
        notes:
          'Sample artwork generated locally. Try changing a size, choosing a paper finish, and exporting this order.',
      });
    });
  }
  function applyGuided(ids: string[], request: PrintRequest, append: boolean) {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) {
      setToast({ message: parsed.error.issues[0].message, error: true });
      return false;
    }
    const photos = order.photos.map((photo) =>
      ids.includes(photo.id)
        ? {
            ...photo,
            requests: [
              ...(append ? photo.requests : []),
              { ...parsed.data, id: crypto.randomUUID() },
            ],
          }
        : photo,
    );
    if (
      photos.some((p) => p.requests.length > 100) ||
      photos.reduce((n, p) => n + p.requests.reduce((s, r) => s + r.quantity, 0), 0) > LIMITS.prints
    ) {
      setToast({
        message:
          'Use at most 100 print choices per photo and 5,000 total prints. Nothing was changed.',
        error: true,
      });
      return false;
    }
    setOrder((o) => ({ ...o, photos }));
    setCompleted([]);
    return true;
  }
  async function addFiles(files: File[]) {
    if (!files.length) return;
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
      await readZip(files[0]);
      return;
    }
    await run(`Adding ${files.length === 1 ? 'photo' : 'photos'}…`, async () => {
      if (order.photos.length + files.length > LIMITS.photos)
        throw new Error('An order can contain up to 500 photos.');
      if (summary.bytes + files.reduce((n, f) => n + f.size, 0) > LIMITS.orderBytes)
        throw new Error('An order can contain up to 512 MB of original images.');
      const added: Photo[] = [],
        errors: string[] = [],
        hashes = new Set(order.photos.map((p) => p.sha256));
      let duplicates = 0;
      for (const file of files) {
        try {
          const photo = await readPhoto(file);
          if (hashes.has(photo.sha256)) {
            releasePhotos([photo]);
            duplicates++;
          } else {
            hashes.add(photo.sha256);
            added.push(photo);
          }
        } catch (err) {
          errors.push(
            `${file.name}: ${err instanceof Error ? err.message : 'Could not read this file.'}`,
          );
        }
      }
      if (added.length) {
        setOrder((o) => ({ ...o, photos: [...o.photos, ...added] }));
        setView('studio');
        setCompleted([]);
      }
      const message = [
        added.length
          ? `${added.length} ${added.length === 1 ? 'photo added' : 'photos added'}.`
          : '',
        duplicates
          ? `${duplicates} duplicate ${duplicates === 1 ? 'skipped' : 'files skipped'}.`
          : '',
        errors.length ? errors.slice(0, 3).join(' ') : '',
      ]
        .filter(Boolean)
        .join(' ');
      setToast({ message, error: errors.length > 0 });
    });
  }
  async function readZip(file: File) {
    await run('Opening and verifying order…', async () => {
      if (file.size > LIMITS.orderBytes + 10 * 1024 * 1024)
        throw new Error('Choose an order ZIP smaller than 522 MB.');
      const imported = await importOrder(new Uint8Array(await file.arrayBuffer()));
      const open = () => {
        replaceOrder(imported);
        setView('print');
        setToast({
          message: `“${imported.name}” opened. All images passed their integrity checks.`,
          error: false,
        });
      };
      if (order.photos.length)
        setConfirmation({
          title: 'Open this order?',
          body: `“${imported.name}” will replace your active draft. Export your current order first if you need to keep it.`,
          label: 'Open order',
          action: open,
          cancel: () => releasePhotos(imported.photos),
        });
      else open();
    });
  }
  async function doExport() {
    await run('Packaging your order…', async () => {
      const bytes = await exportOrder(order);
      if (await saveFile(bytes, `${safeName(order.name)}.zip`, 'zip'))
        setToast({
          message: 'Order exported. Your photos, specifications, and notes are ready to share.',
          error: false,
        });
    });
  }
  function requestExport() {
    if (summary.warnings)
      setConfirmation({
        title: 'Resolution warnings',
        body: `${summary.warnings} ${summary.warnings === 1 ? 'photo falls' : 'photos fall'} below your ${order.targetDpi} DPI target at a requested size. You can still export the order, or cancel to review the sizes.`,
        label: 'Export with warnings',
        action: () => void doExport(),
      });
    else void doExport();
  }
  function startNew() {
    const reset = () => {
      replaceOrder(newOrder());
      setView('studio');
    };
    if (order.photos.length || order.name !== 'Untitled order' || order.notes || order.customer)
      setConfirmation({
        title: 'Start a new order?',
        body: 'Starting a new order replaces the active draft. Export a ZIP first if you want to keep this order.',
        label: 'Start new order',
        action: reset,
      });
    else reset();
  }
  function removePhotos(ids: string[]) {
    setConfirmation({
      title: `Remove ${ids.length === 1 ? 'this photo' : `${ids.length} photos`}?`,
      body: 'They will be removed from this order. The original files on your computer stay exactly where they are.',
      label: 'Remove from order',
      danger: true,
      action: () => {
        releasePhotos(order.photos.filter((p) => ids.includes(p.id)));
        setOrder((o) => ({ ...o, photos: o.photos.filter((p) => !ids.includes(p.id)) }));
        setSelected(new Set());
        setCompleted([]);
      },
    });
  }
  function saveSpecifications(requests: PrintRequest[]) {
    const count = order.photos.reduce(
      (n, p) =>
        n + (editing.includes(p.id) ? requests : p.requests).reduce((a, r) => a + r.quantity, 0),
      0,
    );
    if (count > LIMITS.prints) {
      setToast({
        message: 'An order can contain up to 5,000 prints. Reduce the number of copies.',
        error: true,
      });
      return;
    }
    setOrder((o) => ({
      ...o,
      photos: o.photos.map((p) =>
        editing.includes(p.id)
          ? { ...p, requests: requests.map((r) => ({ ...r, id: crypto.randomUUID() })) }
          : p,
      ),
    }));
    setEditing([]);
    setEditorMode({});
    setCompleted([]);
  }
  function setCartQuantity(photoId: string, requestId: string, quantity: number) {
    const photo = order.photos.find((p) => p.id === photoId),
      request = photo?.requests.find((r) => r.id === requestId);
    if (!request || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) return false;
    if (summary.prints - request.quantity + quantity > LIMITS.prints) {
      setToast({
        message: 'An order can contain up to 5,000 prints. This quantity was not changed.',
        error: true,
      });
      return false;
    }
    setOrder((o) => ({
      ...o,
      photos: o.photos.map((p) =>
        p.id === photoId
          ? { ...p, requests: p.requests.map((r) => (r.id === requestId ? { ...r, quantity } : r)) }
          : p,
      ),
    }));
    setCompleted([]);
    return true;
  }
  function removeCartItem(photoId: string, requestId: string) {
    const photo = order.photos.find((p) => p.id === photoId);
    if (!photo) return;
    if (photo.requests.length === 1) {
      removePhotos([photoId]);
      return;
    }
    setOrder((o) => ({
      ...o,
      photos: o.photos.map((p) =>
        p.id === photoId ? { ...p, requests: p.requests.filter((r) => r.id !== requestId) } : p,
      ),
    }));
    setCompleted([]);
  }
  function movePhoto(index: number, delta: number) {
    setOrder((o) => {
      const photos = [...o.photos];
      [photos[index], photos[index + delta]] = [photos[index + delta], photos[index]];
      return { ...o, photos };
    });
  }
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if (
        !hydrated ||
        busy ||
        editing.length ||
        confirmation ||
        document.querySelector('dialog[open]') ||
        !(e.metaKey || e.ctrlKey)
      )
        return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (order.photos.length) requestExport();
      }
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        zipInput.current?.click();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  });

  const editorPhoto = order.photos.find((p) => p.id === editing[0]);
  const viewName =
    view === 'studio'
      ? 'Order studio'
      : view === 'print'
        ? 'Print desk'
        : view === 'papers'
          ? 'Paper catalog'
          : 'How it works';
  return (
    <div className="app-shell">
      <input
        className="visually-hidden"
        type="file"
        ref={catalogInput}
        accept=".json,application/json"
        aria-label="Choose paper catalog JSON"
        onChange={(e) => {
          if (e.target.files?.[0]) void importCatalog(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        className="visually-hidden"
        type="file"
        ref={imageInput}
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        aria-label="Choose photos"
        onChange={(e) => {
          void addFiles(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      <input
        className="visually-hidden"
        type="file"
        ref={zipInput}
        accept=".zip,application/zip"
        aria-label="Choose order ZIP"
        onChange={(e) => {
          if (e.target.files?.[0]) void readZip(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView('studio');
          }}
        >
          <div className="brand-mark">
            <Aperture size={24} strokeWidth={1.8} />
          </div>
          <span>
            photo<span>request</span>
            <small>PHOTO PRINT ORDERS</small>
          </span>
        </a>
        <button className="new-order-button" onClick={startNew} disabled={!!busy || !hydrated}>
          <Plus size={17} /> New order <span>+</span>
        </button>
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav aria-label="Main navigation">
          <button className={view === 'studio' ? 'active' : ''} onClick={() => setView('studio')}>
            <Images size={18} /> Order studio <ChevronRight size={15} />
          </button>
          <button className={view === 'print' ? 'active' : ''} onClick={() => setView('print')}>
            <Printer size={18} /> Print desk{' '}
            {order.photos.length > 0 && <span className="nav-count">{summary.finishes}</span>}
          </button>
          <button className={view === 'guide' ? 'active' : ''} onClick={() => setView('guide')}>
            <BookOpen size={18} /> How it works
          </button>
          <button className={view === 'papers' ? 'active' : ''} onClick={() => setView('papers')}>
            <FileJson size={18} /> Paper catalog
          </button>
        </nav>
        <div className="sidebar-order">
          <span className="nav-label">ACTIVE ORDER</span>
          <button onClick={() => setView('studio')}>
            <span className="order-folder">
              <FolderOpen size={17} />
            </span>
            <div>
              <strong>{order.name || 'Untitled order'}</strong>
              <span>
                {summary.photos} photos · {summary.prints} prints
              </span>
            </div>
            <span className="status-dot" />
          </button>
        </div>
        <div className="sidebar-bottom">
          <AppUpdates
            ready={hydrated}
            disabled={!!busy}
            beforeInstall={async () => {
              setBusy('Saving order and installing update…');
              await saveChain.current.catch(() => {});
              await saveDraft(latestDraft.current.order, latestDraft.current.completed);
            }}
            afterInstallError={() => setBusy('')}
          />
          <div className="offline-status">
            <span className="status-dot" />
            <span>Stored locally</span>
            <CloudOff size={14} />
          </div>
          <div className="app-version">
            PhotoRequest <span>Build {BUILD.buildNumber}</span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{viewName}</strong>
          </div>
          <div className="topbar-actions">
            <span className="save-status">
              <span className="status-dot" />
              {saved}
            </span>
            <button
              className="button secondary compact"
              disabled={!!busy || !hydrated}
              onClick={() => zipInput.current?.click()}
            >
              <FolderOpen size={15} /> Open order ZIP
            </button>
            <button
              className="icon-button help-button"
              aria-label="How it works"
              onClick={() => setView('guide')}
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <main>
          {view === 'studio' && (
            <div className="order-mode">
              <span>Order view</span>
              <div className="segmented">
                <button
                  aria-pressed={guided}
                  className={guided ? 'selected' : ''}
                  onClick={() => {
                    setGuided(true);
                    localStorage.setItem('photorequest-order-mode', 'guided');
                  }}
                >
                  Guided steps
                </button>
                <button
                  aria-pressed={!guided}
                  className={!guided ? 'selected' : ''}
                  onClick={() => {
                    setGuided(false);
                    localStorage.setItem('photorequest-order-mode', 'all');
                  }}
                >
                  All tools
                </button>
              </div>
              <button className="text-button" onClick={() => catalogInput.current?.click()}>
                <Upload size={14} /> Load paper list
              </button>
            </div>
          )}
          <div hidden={view !== 'papers'}>
            <PaperCatalogManager
              key={catalog ? `${catalog.id}-${catalog.updatedAt}` : 'new'}
              value={catalog}
              onSave={saveCatalog}
              onImport={() => catalogInput.current?.click()}
            />
          </div>
          {view === 'papers' ? null : view === 'guide' ? (
            <Guide />
          ) : view === 'print' ? (
            <PrintDesk
              order={order}
              completed={completed}
              onCompleted={(key) =>
                setCompleted((prev) =>
                  prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                )
              }
              run={run}
              busy={busy}
              onAdd={() => setView('studio')}
              onManagePaper={() => setView('papers')}
            />
          ) : guided ? (
            <GuidedOrder
              order={order}
              catalog={catalog}
              ready={hydrated}
              busy={!!busy}
              onAdd={() => imageInput.current?.click()}
              onFiles={(files) => void addFiles(files)}
              onSample={makeSample}
              onImportCatalog={() => catalogInput.current?.click()}
              onChange={updateOrder}
              onApply={applyGuided}
              onEditPhoto={(id) => {
                setEditorMode({});
                setEditing([id]);
              }}
              onExport={requestExport}
              cart={{
                onEdit: (photoId, requestId) => {
                  setEditorMode({ initialRequestId: requestId });
                  setEditing([photoId]);
                },
                onAddSize: (photoId) => {
                  setEditorMode({ addSize: true });
                  setEditing([photoId]);
                },
                onQuantity: setCartQuantity,
                onRemove: removeCartItem,
                onRemovePhoto: (photoId) => removePhotos([photoId]),
              }}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CREATE ORDER</span>
                  <h1>Create a print order</h1>
                  <p>Add images and set print sizes, quantities, and paper finishes.</p>
                </div>
                <button
                  className="button primary"
                  disabled={!!busy || !hydrated}
                  onClick={() => imageInput.current?.click()}
                >
                  <Plus size={17} /> Add photos
                </button>
              </div>
              <div className="studio-layout">
                <div className="studio-content">
                  <section className="order-details panel">
                    <div className="order-detail-icon">
                      <FolderOpen size={23} strokeWidth={1.6} />
                    </div>
                    <div className="order-name-field">
                      <label htmlFor="order-name">ORDER NAME</label>
                      <input
                        id="order-name"
                        placeholder="Order name"
                        value={order.name}
                        maxLength={160}
                        onChange={(e) => updateOrder({ name: e.target.value })}
                      />
                      <span>Used for the exported ZIP filename.</span>
                    </div>
                    <div className="order-customer-field">
                      <label htmlFor="customer">
                        PREPARED FOR <span>optional</span>
                      </label>
                      <input
                        id="customer"
                        placeholder="Name or project"
                        maxLength={200}
                        value={order.customer}
                        onChange={(e) => updateOrder({ customer: e.target.value })}
                      />
                    </div>
                  </section>
                  <div className="gallery-heading">
                    <div>
                      <h2>
                        Your photos <span>{summary.photos}</span>
                      </h2>
                      <p>
                        {summary.photos
                          ? 'Click a photo to fine-tune its print specifications.'
                          : 'Add images to begin configuring this order.'}
                      </p>
                    </div>
                    <div className="gallery-controls">
                      {summary.photos > 0 && (
                        <button
                          className="button secondary compact"
                          onClick={() =>
                            document
                              .getElementById('order-cart')
                              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        >
                          Review cart <ChevronRight size={13} />
                        </button>
                      )}
                      <div className="unit-switch" aria-label="Measurement units">
                        <button
                          className={units === 'in' ? 'active' : ''}
                          onClick={() => setUnits('in')}
                        >
                          in
                        </button>
                        <button
                          className={units === 'mm' ? 'active' : ''}
                          onClick={() => setUnits('mm')}
                        >
                          mm
                        </button>
                      </div>
                      <span className="grid-indicator">
                        <LayoutGrid size={17} />
                      </span>
                    </div>
                  </div>
                  {summary.photos > 0 && (
                    <div className="selection-bar">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          aria-label="Select all photos"
                          checked={selected.size === order.photos.length}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked ? new Set(order.photos.map((p) => p.id)) : new Set(),
                            )
                          }
                        />
                        {selected.size ? `${selected.size} selected` : 'Select all'}
                      </label>
                      <div>
                        {selected.size > 0 ? (
                          <>
                            <button
                              className="text-button"
                              onClick={() => setEditing([...selected])}
                            >
                              <SlidersHorizontal size={14} /> Edit specifications
                            </button>
                            <button
                              className="text-button remove-text"
                              onClick={() => removePhotos([...selected])}
                            >
                              <Trash2 size={14} /> Remove
                            </button>
                          </>
                        ) : (
                          <span className="muted small-text">
                            Original files stay untouched <LockKeyhole size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div
                    className={`photo-drop-area ${dragging ? 'dragging' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!busy && hydrated) setDragging(true);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      if (!busy && hydrated) void addFiles(Array.from(e.dataTransfer.files));
                    }}
                  >
                    {!summary.photos ? (
                      <div className="empty-state">
                        <div className="photo-stack" aria-hidden="true">
                          <div className="stack-photo back">
                            <div className="art-sky" />
                            <div className="art-hill" />
                          </div>
                          <div className="stack-photo middle">
                            <div className="art-sky" />
                            <div className="art-sun" />
                            <div className="art-hill" />
                          </div>
                          <div className="stack-photo front">
                            <div className="art-sky" />
                            <div className="art-sun" />
                            <div className="art-hill" />
                            <div className="art-hill foreground" />
                          </div>
                          <span className="stack-sparkle">
                            <Sparkles size={25} strokeWidth={1.4} />
                          </span>
                        </div>
                        <h2>Add images to this order</h2>
                        <p>
                          Drop JPEG, PNG, or WebP files here, or select files from your computer.
                        </p>
                        <button
                          className="button primary"
                          disabled={!!busy || !hydrated}
                          onClick={() => imageInput.current?.click()}
                        >
                          <ImagePlus size={17} /> Choose images
                        </button>
                        <span className="supported-files">
                          JPEG, PNG & WEBP <span>·</span> UP TO 100 MB EACH
                        </span>
                        <div className="sample-order">
                          <span>Preview the workflow:</span>
                          <button
                            className="text-button"
                            disabled={!!busy || !hydrated}
                            onClick={() =>
                              void run('Creating a sample order…', async () => {
                                const photos = await samplePhotos();
                                replaceOrder({
                                  ...newOrder(),
                                  name: 'Sample print order',
                                  customer: 'Sample customer',
                                  photos,
                                  notes:
                                    'Sample artwork generated locally. Try changing a size, choosing a paper finish, and exporting this order.',
                                });
                              })
                            }
                          >
                            Create a sample order <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="photo-grid">
                        {order.photos.map((photo, index) => {
                          const dpi = Math.min(
                              ...photo.requests.map((r) => effectiveDpi(photo, r)),
                            ),
                            grade = quality(dpi, order.targetDpi),
                            copies = photo.requests.reduce((n, r) => n + r.quantity, 0);
                          return (
                            <article
                              className={`photo-card ${selected.has(photo.id) ? 'is-selected' : ''}`}
                              key={photo.id}
                            >
                              <div className="photo-card-image">
                                <button
                                  className="image-edit-button"
                                  aria-label={`Edit ${photoName(index)}`}
                                  onClick={() => setEditing([photo.id])}
                                >
                                  <img src={photo.url} alt={photo.originalName} />
                                </button>
                                <input
                                  className="photo-checkbox"
                                  type="checkbox"
                                  aria-label={`Select ${photoName(index)}`}
                                  checked={selected.has(photo.id)}
                                  onChange={(e) =>
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(photo.id);
                                      else next.delete(photo.id);
                                      return next;
                                    })
                                  }
                                />
                                <span className={`quality-badge ${grade}`}>
                                  {grade === 'good' ? (
                                    <Check size={11} />
                                  ) : (
                                    <TriangleAlert size={11} />
                                  )}
                                  {dpi} DPI
                                </span>
                                <div className="photo-reorder">
                                  <button
                                    aria-label={`Move ${photoName(index)} earlier`}
                                    disabled={index === 0}
                                    onClick={() => movePhoto(index, -1)}
                                  >
                                    <ArrowLeft size={13} />
                                  </button>
                                  <button
                                    aria-label={`Move ${photoName(index)} later`}
                                    disabled={index === order.photos.length - 1}
                                    onClick={() => movePhoto(index, 1)}
                                  >
                                    <ArrowRight size={13} />
                                  </button>
                                </div>
                              </div>
                              <div className="photo-card-body">
                                <div className="photo-title-row">
                                  <h3>{photoName(index)}</h3>
                                  <span>×{copies}</span>
                                </div>
                                <p className="original-name" title={photo.originalName}>
                                  {photo.originalName}
                                </p>
                                <div className="photo-specs">
                                  {photo.requests.slice(0, 2).map((r) => (
                                    <div key={r.id}>
                                      <span>
                                        {sizeLabel(r, units)}{' '}
                                        <span className="muted">×{r.quantity}</span>
                                      </span>
                                      <span>
                                        <i className={`finish-dot ${r.finish}`} />
                                        {r.finish === 'holographic'
                                          ? r.holographicStyle
                                          : finishLabel(r)}
                                      </span>
                                    </div>
                                  ))}
                                  {photo.requests.length > 2 && (
                                    <span className="muted small-text">
                                      +{photo.requests.length - 2} more sizes
                                    </span>
                                  )}
                                </div>
                                <button
                                  className="edit-specs-button"
                                  onClick={() => setEditing([photo.id])}
                                >
                                  <SlidersHorizontal size={13} /> Print specifications{' '}
                                  <ArrowUpRight size={13} />
                                </button>
                              </div>
                            </article>
                          );
                        })}
                        <button
                          className="add-photo-tile"
                          disabled={!!busy}
                          onClick={() => imageInput.current?.click()}
                        >
                          <div>
                            <Plus size={24} />
                          </div>
                          <strong>Add images</strong>
                          <span>Add photos or drop them here</span>
                        </button>
                      </div>
                    )}
                    {dragging && (
                      <div className="drop-overlay">
                        <Upload size={38} />
                        <strong>Drop your photos here</strong>
                        <span>JPEG, PNG, or WebP files</span>
                      </div>
                    )}
                  </div>
                  <div className="studio-bottom-note">
                    <ShieldCheck size={15} />
                    <span>
                      Your original images stay full resolution. We only rename the copies inside
                      your order.
                    </span>
                  </div>
                  <OrderCart
                    order={order}
                    units={units}
                    onEdit={(photoId, requestId) => {
                      setEditorMode({ initialRequestId: requestId });
                      setEditing([photoId]);
                    }}
                    onAddSize={(photoId) => {
                      setEditorMode({ addSize: true });
                      setEditing([photoId]);
                    }}
                    onQuantity={setCartQuantity}
                    onRemove={removeCartItem}
                    onRemovePhoto={(photoId) => removePhotos([photoId])}
                  />
                  <section className="order-notes panel">
                    <div className="section-label">
                      <h3>Print instructions</h3>
                      <span>OPTIONAL</span>
                    </div>
                    <textarea
                      aria-label="Order notes"
                      maxLength={5000}
                      placeholder="Paper stock, finishing details, deadlines, or other printing instructions…"
                      value={order.notes}
                      onChange={(e) => updateOrder({ notes: e.target.value })}
                      rows={3}
                    />
                    <div>
                      <span>Included in your order package</span>
                      <span>{order.notes.length}/5000</span>
                    </div>
                  </section>
                </div>
                <aside className="order-summary">
                  <section className="panel summary-panel">
                    <div className="summary-header">
                      <span className="summary-icon">
                        <Package size={20} strokeWidth={1.6} />
                      </span>
                      <h2>Order summary</h2>
                    </div>
                    <div className="summary-stats">
                      <div>
                        <strong>{String(summary.photos).padStart(2, '0')}</strong>
                        <span>photos</span>
                      </div>
                      <div>
                        <strong>{String(summary.prints).padStart(2, '0')}</strong>
                        <span>total prints</span>
                      </div>
                      <div>
                        <strong>{String(summary.finishes).padStart(2, '0')}</strong>
                        <span>paper finishes</span>
                      </div>
                    </div>
                    <div className="summary-divider" />
                    <div className="summary-line">
                      <span>Original image size</span>
                      <strong>{formatBytes(summary.bytes)}</strong>
                    </div>
                    <div className="summary-line">
                      <span>File naming</span>
                      <code>photo00001…</code>
                    </div>
                    <label className="summary-target">
                      Target print resolution
                      <select
                        aria-label="Target DPI"
                        value={order.targetDpi}
                        onChange={(e) => updateOrder({ targetDpi: Number(e.target.value) })}
                      >
                        {[150, 200, 300, 600, 1200].map((dpi) => (
                          <option key={dpi} value={dpi}>
                            {dpi} DPI{dpi === 300 ? ' · recommended' : ''}
                          </option>
                        ))}
                        {![150, 200, 300, 600, 1200].includes(order.targetDpi) && (
                          <option value={order.targetDpi}>{order.targetDpi} DPI</option>
                        )}
                      </select>
                    </label>
                    <div className={`resolution-note ${summary.warnings ? 'has-warning' : ''}`}>
                      {summary.warnings ? <TriangleAlert size={16} /> : <CheckCheck size={16} />}
                      <span>
                        {summary.warnings
                          ? `${summary.warnings} ${summary.warnings === 1 ? 'photo needs' : 'photos need'} a resolution review`
                          : summary.photos
                            ? 'All photos meet your resolution target'
                            : 'We’ll check every photo at its print size'}
                      </span>
                    </div>
                    <div className="summary-divider" />
                    <div className="package-contents">
                      <span className="eyebrow">ZIP CONTENTS</span>
                      <div>
                        <Images size={15} />
                        <span>Full-resolution originals</span>
                        <Check size={13} />
                      </div>
                      <div>
                        <FileJson size={15} />
                        <span>Print specifications in JSON</span>
                        <Check size={13} />
                      </div>
                      <div>
                        <Archive size={15} />
                        <span>One shareable ZIP file</span>
                        <Check size={13} />
                      </div>
                    </div>
                    <button
                      className="button primary export-button"
                      disabled={!summary.photos || !!busy || !hydrated || !order.name.trim()}
                      onClick={requestExport}
                    >
                      <ArrowDownToLine size={17} /> Export order ZIP <ArrowUpRight size={16} />
                    </button>
                    <button
                      className="button secondary full-width"
                      disabled={!summary.photos || !!busy}
                      onClick={() => setView('print')}
                    >
                      <Printer size={16} /> Prepare to print <ChevronRight size={15} />
                    </button>
                    <p className="export-caption">Includes original image files and order.json.</p>
                  </section>
                  <div className="handoff-tip">
                    <div>
                      <Sparkles size={17} />
                      <strong>Opening an order</strong>
                    </div>
                    <p>
                      Open the exported ZIP in PhotoRequest on the receiving computer to review
                      specifications and prepare print sheets.
                    </p>
                    <button className="text-button" onClick={() => setView('guide')}>
                      View instructions <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="local-privacy">
                    <LockKeyhole size={13} />
                    <span>Images and orders are stored locally.</span>
                  </div>
                </aside>
              </div>
              <div className="workflow-strip">
                <span>
                  <span className="step-number">1</span> Add images
                </span>
                <ChevronRight size={13} />
                <span>
                  <span className="step-number">2</span> Set print specifications
                </span>
                <ChevronRight size={13} />
                <span>
                  <span className="step-number">3</span> Share or print
                </span>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            PhotoRequest · commit {BUILD.shortCommit} · build {BUILD.buildNumber}
          </span>
          <span>
            <LockKeyhole size={12} /> Files are stored on this computer.
          </span>
        </footer>
      </div>
      {busy && (
        <div className="busy-overlay" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={22} />
          <strong>{busy}</strong>
          <span>Please keep this window open.</span>
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <TriangleAlert size={19} /> : <Check size={19} />}
          <span>{toast.message}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {editorPhoto && (
        <PhotoEditor
          key={editing.join(',')}
          photo={editorPhoto}
          {...editorMode}
          catalog={catalog}
          maxPrints={
            LIMITS.prints -
            order.photos
              .filter((p) => !editing.includes(p.id))
              .reduce((n, p) => n + p.requests.reduce((total, r) => total + r.quantity, 0), 0)
          }
          count={editing.length}
          targetDpi={order.targetDpi}
          units={units}
          onClose={() => {
            setEditing([]);
            setEditorMode({});
          }}
          onSave={saveSpecifications}
        />
      )}
      {confirmation && <Confirm value={confirmation} onClose={() => setConfirmation(null)} />}
    </div>
  );
}
