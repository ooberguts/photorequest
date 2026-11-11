import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleCheck,
  Download,
  FileImage,
  Info,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import {
  DEFAULT_PRINT,
  PAPERS,
  generatePrintPdf,
  layoutGroup,
  printGroups,
  type PrintGroup,
  type PrintSettings,
  type PrintPage,
} from '../lib/printing';
import { effectiveDpi, safeName, sizeLabel, stats, type Order } from '../lib/model';
import { saveFile, openPrintPdf } from '../lib/files';

type Props = {
  order: Order;
  completed: string[];
  onCompleted: (key: string) => void;
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  busy: string;
  onAdd: () => void;
};
export default function PrintDesk({ order, completed, onCompleted, run, busy, onAdd }: Props) {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT);
  const groups = printGroups(order);
  const [activeKey, setActiveKey] = useState('');
  const active = groups.find((g) => g.key === activeKey) || groups[0];
  const [pageNumber, setPageNumber] = useState(0);
  let pages: PrintPage[] = [],
    layoutError = '';
  try {
    if (active) pages = layoutGroup(active, settings);
  } catch (err) {
    layoutError = err instanceof Error ? err.message : 'Check the sheet settings.';
  }
  const page = pages[Math.min(pageNumber, pages.length - 1)];
  const summary = stats(order);
  const countDone = groups.filter((g) => completed.includes(g.key)).length;
  const paper = PAPERS.find((p) => p.id === settings.paper)!;
  async function pdf(group: PrintGroup, open: boolean) {
    await run(open ? 'Preparing print file…' : 'Building print-ready PDF…', async () => {
      const bytes = await generatePrintPdf(order, group, settings);
      if (open) await openPrintPdf(bytes);
      else await saveFile(bytes, `${safeName(order.name)}-${safeName(group.label)}.pdf`, 'pdf');
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PREPARE PRINTS</span>
          <h1>Print desk</h1>
          <p>Prepare PDF sheets and track printing by paper finish.</p>
        </div>
        <div className="heading-badge">
          <Printer size={17} /> {summary.prints} prints in {groups.length} paper batches
        </div>
      </div>
      {!groups.length ? (
        <div className="empty-print">
          <div className="empty-icon">
            <Printer size={33} />
          </div>
          <h2>No images to print</h2>
          <p>Add photos to an order or open an order ZIP to start preparing prints.</p>
          <button className="button primary" onClick={onAdd}>
            Go to order studio <ArrowUpRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="print-topline">
            <div>
              <span className="status-dot" />
              <strong>{order.name}</strong>
              <span>{order.customer || 'Your photo order'}</span>
            </div>
            <span>
              {countDone} of {groups.length} batches marked printed
            </span>
          </div>
          <div className="print-layout">
            <div className="batch-column">
              <div className="section-label">
                <h3>Paper batches</h3>
                <span>{groups.length}</span>
              </div>
              <p className="muted small-text">Load one finish at a time.</p>
              {groups.map((group, index) => (
                <button
                  className={`batch-card ${active?.key === group.key ? 'active' : ''}`}
                  key={group.key}
                  onClick={() => {
                    setActiveKey(group.key);
                    setPageNumber(0);
                  }}
                >
                  <div className="batch-card-top">
                    <span className={`finish-swatch ${group.items[0].request.finish}`} />
                    <span className="eyebrow">BATCH {String(index + 1).padStart(2, '0')}</span>
                    {completed.includes(group.key) ? (
                      <CircleCheck size={17} className="green" />
                    ) : (
                      <span className="batch-number">{group.items.length}</span>
                    )}
                  </div>
                  <strong>{group.label}</strong>
                  <span>
                    {group.items.length} prints ·{' '}
                    {new Set(group.items.map((i) => sizeLabel(i.request))).size} sizes
                  </span>
                  <div className="batch-thumbs">
                    {[...new Map(group.items.map((i) => [i.photo.id, i.photo])).values()]
                      .slice(0, 4)
                      .map((p) => (
                        <img key={p.id} src={p.url} alt={p.originalName} />
                      ))}
                  </div>
                </button>
              ))}
              <div className="paper-note">
                <Info size={17} />
                <p>Holographic patterns come from your physical paper or finishing process.</p>
              </div>
            </div>
            <section className="sheet-panel">
              <div className="sheet-panel-heading">
                <div>
                  <h3>Sheet preview</h3>
                  <span>
                    {paper.label} · {paper.detail}
                  </span>
                </div>
                <span className="preview-pill">EXACT SIZE</span>
              </div>
              <div className="sheet-preview-background">
                {layoutError ? (
                  <div className="sheet-error">
                    <TriangleAlert size={29} />
                    <strong>Print exceeds the selected sheet size</strong>
                    <p>{layoutError}</p>
                  </div>
                ) : (
                  page && (
                    <div
                      className="paper-preview"
                      style={{ aspectRatio: `${page.width} / ${page.height}` }}
                    >
                      <div
                        className="paper-margin"
                        style={{
                          inset: `${(settings.margin / page.height) * 100}% ${(settings.margin / page.width) * 100}%`,
                        }}
                      />
                      {page.placements.map((p, i) => (
                        <div
                          key={i}
                          className={`sheet-photo ${settings.cropMarks ? 'with-crop' : ''}`}
                          style={{
                            left: `${(p.x / page.width) * 100}%`,
                            top: `${(p.y / page.height) * 100}%`,
                            width: `${(p.width / page.width) * 100}%`,
                            height: `${(p.height / page.height) * 100}%`,
                          }}
                        >
                          <img
                            src={p.photo.url}
                            alt={`${p.photo.originalName}, copy ${p.copy}`}
                            style={
                              p.rotated
                                ? {
                                    width: `${(p.height / p.width) * 100}%`,
                                    height: `${(p.width / p.height) * 100}%`,
                                    position: 'absolute',
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                                    objectFit: p.request.fit === 'fill' ? 'cover' : 'contain',
                                  }
                                : { objectFit: p.request.fit === 'fill' ? 'cover' : 'contain' }
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
              <div className="sheet-pagination">
                <button
                  className="text-button"
                  disabled={pageNumber === 0 || !pages.length}
                  onClick={() => setPageNumber((n) => Math.max(0, n - 1))}
                >
                  ← Previous
                </button>
                <span>
                  Sheet {pages.length ? Math.min(pageNumber + 1, pages.length) : 0} of{' '}
                  {pages.length}
                </span>
                <button
                  className="text-button"
                  disabled={pageNumber >= pages.length - 1}
                  onClick={() => setPageNumber((n) => n + 1)}
                >
                  Next →
                </button>
              </div>
              <div className="print-hint">
                <Info size={16} />
                <span>
                  Print at <strong>Actual size / 100%</strong>. Turn off “Fit to page” and duplex.
                </span>
              </div>
            </section>
            <aside className="print-options panel">
              <div className="panel-heading">
                <SlidersHorizontal size={17} />
                <h3>Print setup</h3>
              </div>
              <label>
                Sheet size
                <select
                  aria-label="Sheet size"
                  value={settings.paper}
                  onChange={(e) => {
                    setSettings((s) => ({ ...s, paper: e.target.value }));
                    setPageNumber(0);
                  }}
                >
                  {PAPERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.detail}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Layout
                <select
                  aria-label="Print layout"
                  value={settings.layout}
                  onChange={(e) => {
                    setSettings((s) => ({ ...s, layout: e.target.value as 'pack' | 'single' }));
                    setPageNumber(0);
                  }}
                >
                  <option value="pack">Save paper · multiple prints</option>
                  <option value="single">One print per sheet</option>
                </select>
              </label>
              <div className="two-fields">
                <label>
                  Margin (in)
                  <input
                    aria-label="Sheet margin"
                    type="number"
                    min="0"
                    max="2"
                    step="0.05"
                    value={settings.margin}
                    onChange={(e) => setSettings((s) => ({ ...s, margin: Number(e.target.value) }))}
                  />
                </label>
                <label>
                  Gap (in)
                  <input
                    aria-label="Print spacing"
                    type="number"
                    min="0"
                    max="2"
                    step="0.05"
                    value={settings.gap}
                    onChange={(e) => setSettings((s) => ({ ...s, gap: Number(e.target.value) }))}
                  />
                </label>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.cropMarks}
                  onChange={(e) => setSettings((s) => ({ ...s, cropMarks: e.target.checked }))}
                />{' '}
                Add cut guides
              </label>
              {settings.margin === 0 && (
                <p className="micro-note">
                  Zero margins require a borderless printer. Turn off borderless expansion in its
                  driver.
                </p>
              )}
              <div className="print-setup-divider" />
              <div className="batch-summary">
                <span>Selected batch</span>
                <strong>{active.label}</strong>
                <div>
                  <span>{active.items.length} prints</span>
                  <span>{pages.length} sheets</span>
                </div>
              </div>
              <button
                className="button primary full-width"
                disabled={!!busy || !!layoutError}
                onClick={() => void pdf(active, true)}
              >
                <Printer size={16} /> Open PDF to print <ArrowUpRight size={15} />
              </button>
              <button
                className="button secondary full-width"
                disabled={!!busy || !!layoutError}
                onClick={() => void pdf(active, false)}
              >
                <Download size={16} /> Save batch PDF
              </button>
              <button
                className={`button full-width ${completed.includes(active.key) ? 'completed-button' : 'text-button'}`}
                onClick={() => onCompleted(active.key)}
              >
                {completed.includes(active.key) ? (
                  <>
                    <RotateCcw size={14} /> Mark as unprinted
                  </>
                ) : (
                  <>
                    <CheckCheck size={16} /> Mark batch printed
                  </>
                )}
              </button>
              <p className="micro-note">
                The PDF opens in your computer’s PDF app. Choose your printer, stock, and quality
                there. Copies are already included in the PDF.
              </p>
            </aside>
          </div>
          <section className="production-list panel">
            <div className="panel-heading">
              <FileImage size={18} />
              <h3>Batch checklist</h3>
              <span>{active.label}</span>
            </div>
            <div className="checklist-table">
              <div className="checklist-row table-head">
                <span>PHOTO</span>
                <span>PRINT SIZE</span>
                <span>FITTING</span>
                <span>DPI</span>
                <span>COPIES</span>
              </div>
              {[
                ...new Map(active.items.map((i) => [`${i.photo.id}-${i.request.id}`, i])).values(),
              ].map((item) => (
                <div className="checklist-row" key={`${item.photo.id}-${item.request.id}`}>
                  <span className="checklist-photo">
                    <img src={item.photo.url} alt="" />
                    <strong>{item.photo.originalName}</strong>
                  </span>
                  <span>{sizeLabel(item.request)}</span>
                  <span>{item.request.fit === 'fill' ? 'Center crop' : 'Fit whole image'}</span>
                  <span
                    className={
                      effectiveDpi(item.photo, item.request) < order.targetDpi ? 'amber' : 'green'
                    }
                  >
                    {effectiveDpi(item.photo, item.request)} DPI
                  </span>
                  <span>× {item.request.quantity}</span>
                </div>
              ))}
            </div>
          </section>
          {order.notes && (
            <div className="operator-notes">
              <span className="eyebrow">A NOTE FROM THE REQUESTER</span>
              <p>{order.notes}</p>
            </div>
          )}
          {summary.warnings > 0 && (
            <div className="warning-banner">
              <TriangleAlert size={17} />
              <span>
                {summary.warnings} {summary.warnings === 1 ? 'photo is' : 'photos are'} below the{' '}
                {order.targetDpi} DPI target at a requested size. Review them before printing.
              </span>
            </div>
          )}
          <div className="workflow-strip">
            <span>
              <Check size={15} /> Original images preserved
            </span>
            <span>
              <Check size={15} /> Print dimensions locked
            </span>
            <span>
              <Check size={15} /> Paper finishes separated
            </span>
          </div>
        </>
      )}
    </>
  );
}
