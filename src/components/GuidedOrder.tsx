import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, ImagePlus, Plus, Upload } from 'lucide-react';
import OrderCart from './OrderCart';
import PaperPicker from './PaperPicker';
import {
  HOLOGRAPHIC,
  SIZES,
  finishLabel,
  newRequest,
  sizeLabel,
  stats,
  type Order,
  type PrintRequest,
} from '../lib/model';
import { paperNotice, type PaperCatalog } from '../lib/papers';

type CartProps = React.ComponentProps<typeof OrderCart>;
type Props = {
  order: Order;
  catalog: PaperCatalog | null;
  ready: boolean;
  busy: boolean;
  onAdd: () => void;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  onImportCatalog: () => void;
  onChange: (patch: Partial<Order>) => void;
  onApply: (ids: string[], request: PrintRequest, append: boolean) => boolean;
  onEditPhoto: (id: string) => void;
  onExport: () => void;
  cart: Omit<CartProps, 'order' | 'units'>;
};
const steps = ['Add photos', 'Choose prints', 'Review & export'];
export default function GuidedOrder({
  order,
  catalog,
  ready,
  busy,
  onAdd,
  onFiles,
  onSample,
  onImportCatalog,
  onChange,
  onApply,
  onEditPhoto,
  onExport,
  cart,
}: Props) {
  const [step, setStep] = useState(0);
  const [units, setUnits] = useState<'in' | 'mm'>('in');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<PrintRequest>(newRequest);
  const [append, setAppend] = useState(false);
  const appliedChoice = useRef(choice);
  const [pendingChoice, setPendingChoice] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const total = stats(order);
  const selected = order.photos.filter((p) => !excluded.has(p.id));
  const notices = order.photos.flatMap((p) =>
    p.requests.flatMap((r) =>
      r.paper && paperNotice(r.paper, catalog)
        ? [`${p.originalName}: ${paperNotice(r.paper, catalog)}`]
        : [],
    ),
  );
  const crops = order.photos.filter((p) =>
    p.requests.some(
      (r) =>
        r.fit === 'fill' &&
        Math.abs(
          Math.max(p.width, p.height) / Math.min(p.width, p.height) -
            Math.max(r.widthInches, r.heightInches) / Math.min(r.widthInches, r.heightInches),
        ) > 0.03,
    ),
  );
  // An order replacement starts a fresh walkthrough without changing its print choices.
  useEffect(() => {
    setStep(0);
    setExcluded(new Set());
    setMessage('');
  }, [order.id]);
  function go(next: number) {
    if (next === 2 && pendingChoice) {
      setStep(1);
      setError('Apply your changed settings or discard them before reviewing the order.');
      return;
    }
    setStep(next);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function patchChoice(patch: Partial<PrintRequest>) {
    setChoice((r) => ({ ...r, ...patch }));
    setPendingChoice(true);
    setMessage('');
    setError('');
  }
  const scale = units === 'mm' ? 25.4 : 1;
  return (
    <div className="guided-order">
      <nav className="order-steps" aria-label="Order steps">
        {steps.map((title, i) => (
          <button
            key={title}
            aria-current={step === i ? 'step' : undefined}
            disabled={i > 0 && !total.photos}
            onClick={() => go(i)}
          >
            <span>{i < step ? <Check size={17} /> : i + 1}</span>
            <strong>{title}</strong>
          </button>
        ))}
      </nav>
      <div className="guided-heading">
        <span className="eyebrow">STEP {step + 1} OF 3</span>
        <h1>
          {step === 0
            ? 'Which photos would you like to print?'
            : step === 1
              ? 'Choose sizes, copies, and paper'
              : 'Check your print list'}
        </h1>
        <p>
          {step === 0
            ? 'Add photos from your computer. You can add more or remove any before exporting.'
            : step === 1
              ? 'Start with one setting for several photos, then adjust any photo individually.'
              : 'Review each size and paper choice, name the order, and save the ZIP to send to your printer.'}
        </p>
      </div>
      {step === 0 && (
        <>
          <div
            className="guided-upload panel"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              onFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <ImagePlus size={36} />
            <h2>{total.photos ? 'Add more photos' : 'Add your photos'}</h2>
            <p>Drop photos here, or use the button to find them on your computer.</p>
            <button className="button primary" disabled={!ready || busy} onClick={onAdd}>
              <Plus size={18} /> Choose photos
            </button>
            <small>JPEG, PNG, or WebP · Your original files stay unchanged.</small>
            {!total.photos && (
              <button className="text-button" disabled={!ready || busy} onClick={onSample}>
                Create a sample order
              </button>
            )}
          </div>
          {total.photos > 0 && (
            <>
              <div className="guided-section-heading">
                <h2>
                  {total.photos} {total.photos === 1 ? 'photo added' : 'photos added'}
                </h2>
                <p>
                  Review the current print choices below. Change sizes, copies, and paper in the
                  next step.
                </p>
              </div>
              <div className="guided-photos">
                {order.photos.map((p) => (
                  <article className="guided-photo panel" key={p.id}>
                    <img src={p.url} alt={p.originalName} />
                    <div>
                      <strong title={p.originalName}>{p.originalName}</strong>
                      <span>
                        {p.requests
                          .map(
                            (r) =>
                              `${sizeLabel(r)} · ${r.quantity} ${r.quantity === 1 ? 'copy' : 'copies'}`,
                          )
                          .join(' / ')}
                      </span>
                      <button className="text-button" onClick={() => cart.onRemovePhoto(p.id)}>
                        Remove photo
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {step === 1 && (
        <div className="guided-choices-layout">
          <section className="guided-choice panel" aria-label="Print choices">
            <h2>1. Choose the print settings</h2>
            <label>
              Print size
              <select
                aria-label="Guided print size"
                value={
                  SIZES.some(
                    (s) => s.width === choice.widthInches && s.height === choice.heightInches,
                  )
                    ? `${choice.widthInches}x${choice.heightInches}`
                    : 'custom'
                }
                onChange={(e) => {
                  const [w, h] =
                    e.target.value === 'custom' ? [6.5, 9] : e.target.value.split('x').map(Number);
                  patchChoice({ widthInches: w, heightInches: h });
                }}
              >
                {SIZES.map((s) => (
                  <option key={s.label} value={`${s.width}x${s.height}`}>
                    {sizeLabel({ widthInches: s.width, heightInches: s.height }, units)}
                    {s.width === 4 && s.height === 6
                      ? ' · standard photo'
                      : s.width === 5 && s.height === 7
                        ? ' · small frame'
                        : s.width === 8 && s.height === 10
                          ? ' · enlargement'
                          : ''}
                  </option>
                ))}
                <option value="custom">Custom size</option>
              </select>
            </label>
            <details className="guided-custom">
              <summary>Custom dimensions and units</summary>
              <label>
                Measurement units
                <select
                  aria-label="Guided measurement units"
                  value={units}
                  onChange={(e) => setUnits(e.target.value as 'in' | 'mm')}
                >
                  <option value="in">Inches</option>
                  <option value="mm">Millimeters</option>
                </select>
              </label>
              <div className="two-fields">
                <label>
                  Width ({units})
                  <input
                    aria-label="Guided print width"
                    type="number"
                    min={0.5 * scale}
                    max={60 * scale}
                    step="any"
                    value={+(choice.widthInches * scale).toFixed(3)}
                    onChange={(e) => patchChoice({ widthInches: Number(e.target.value) / scale })}
                  />
                </label>
                <label>
                  Height ({units})
                  <input
                    aria-label="Guided print height"
                    type="number"
                    min={0.5 * scale}
                    max={60 * scale}
                    step="any"
                    value={+(choice.heightInches * scale).toFixed(3)}
                    onChange={(e) => patchChoice({ heightInches: Number(e.target.value) / scale })}
                  />
                </label>
              </div>
            </details>
            <label>
              Copies of each selected photo
              <input
                aria-label="Guided copies"
                type="number"
                min={1}
                max={999}
                value={choice.quantity}
                onChange={(e) => patchChoice({ quantity: Number(e.target.value) })}
              />
            </label>
            <div className="guided-paper-header">
              <h3>Paper</h3>
              <button className="text-button" onClick={onImportCatalog}>
                <Upload size={14} /> Load printer’s paper list
              </button>
            </div>
            {catalog && (
              <p className="micro-note">
                {catalog.name}
                {catalog.printerName ? ` · ${catalog.printerName}` : ''}
              </p>
            )}
            <PaperPicker request={choice} catalog={catalog} onChange={patchChoice} />
            {!choice.paper && (
              <>
                <label>
                  Paper finish
                  <select
                    aria-label="Guided paper finish"
                    value={choice.finish}
                    onChange={(e) =>
                      patchChoice({
                        finish: e.target.value as PrintRequest['finish'],
                        holographicStyle: e.target.value === 'holographic' ? 'Rainbow' : '',
                      })
                    }
                  >
                    <option value="matte">Matte · low shine</option>
                    <option value="gloss">Gloss · shiny surface</option>
                    <option value="holographic">Holographic · patterned physical paper</option>
                  </select>
                </label>
                {choice.finish === 'holographic' && (
                  <label>
                    Pattern
                    <input
                      aria-label="Guided holographic pattern"
                      list="guided-patterns"
                      maxLength={100}
                      value={choice.holographicStyle}
                      onChange={(e) => patchChoice({ holographicStyle: e.target.value })}
                    />
                    <datalist id="guided-patterns">
                      {HOLOGRAPHIC.filter((p) => p !== 'Custom').map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </datalist>
                  </label>
                )}
              </>
            )}
            <label>
              How should the photo fit?
              <select
                aria-label="Guided image fitting"
                value={choice.fit}
                onChange={(e) => patchChoice({ fit: e.target.value as PrintRequest['fit'] })}
              >
                <option value="fill">Fill the print · edges may be cropped</option>
                <option value="fit">Keep the whole photo · may leave white space</option>
              </select>
            </label>
            <p className="micro-note">
              Use Edit prints beside a photo to see exactly how it will fit.
            </p>
            <label>
              When applying these settings
              <select
                aria-label="Apply print choices mode"
                value={append ? 'add' : 'replace'}
                onChange={(e) => setAppend(e.target.value === 'add')}
              >
                <option value="replace">Replace selected photos’ print choices</option>
                <option value="add">Add another size and keep existing choices</option>
              </select>
            </label>
            <p className="micro-note">
              {append
                ? 'Keeps every existing size and adds this one to each selected photo.'
                : 'Replaces all sizes on the selected photos with this choice. Other photos stay as they are.'}
            </p>
            <button
              className="button primary full-width"
              disabled={!selected.length || busy}
              onClick={() => {
                if (
                  onApply(
                    selected.map((p) => p.id),
                    choice,
                    append,
                  )
                ) {
                  appliedChoice.current = choice;
                  setPendingChoice(false);
                  setMessage(
                    `Print choices ${append ? 'added to' : 'set for'} ${selected.length} ${selected.length === 1 ? 'photo' : 'photos'}. Review the list or keep adding sizes.`,
                  );
                  setError('');
                } else {
                  setError(
                    'Print choices were not changed. Check the highlighted notification and try again.',
                  );
                }
              }}
            >
              {append ? 'Add this size to' : 'Set prints for'} {selected.length}{' '}
              {selected.length === 1 ? 'photo' : 'photos'}
            </button>
            {pendingChoice && (
              <p className="inline-warning">
                These settings have not been applied yet. Apply them to the selected photos, or{' '}
                <button
                  className="text-button"
                  onClick={() => {
                    setChoice(appliedChoice.current);
                    setPendingChoice(false);
                    setError('');
                    setError('');
                  }}
                >
                  discard these setting changes
                </button>{' '}
                before continuing.
              </p>
            )}
            {message && (
              <p className="guided-success" role="status">
                <Check size={16} />
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
          </section>
          <section className="guided-selected" aria-label="Choose photos for settings">
            <div className="guided-section-heading">
              <h2>2. Choose the photos</h2>
              <p>
                Checked photos receive the settings on the left. Use Edit prints for individual
                sizes, paper, or crop previews.
              </p>
              <button
                className="text-button"
                onClick={() =>
                  setExcluded(
                    selected.length === order.photos.length
                      ? new Set(order.photos.map((p) => p.id))
                      : new Set(),
                  )
                }
              >
                {selected.length === order.photos.length
                  ? 'Deselect all photos'
                  : 'Select all photos'}
              </button>
            </div>
            {order.photos.map((p) => (
              <article className="guided-selected-photo panel" key={p.id}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Apply settings to ${p.originalName}`}
                    checked={!excluded.has(p.id)}
                    onChange={(e) =>
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        e.target.checked ? next.delete(p.id) : next.add(p.id);
                        return next;
                      })
                    }
                  />
                  <img src={p.url} alt="" />
                  <strong>{p.originalName}</strong>
                </label>
                <ul>
                  {p.requests.map((r) => (
                    <li key={r.id}>
                      <span>
                        {sizeLabel(r, units)} · {r.quantity} {r.quantity === 1 ? 'copy' : 'copies'}
                      </span>
                      <span>{r.paper?.paper.name || finishLabel(r)}</span>
                    </li>
                  ))}
                </ul>
                <button className="button secondary compact" onClick={() => onEditPhoto(p.id)}>
                  Edit prints & preview
                </button>
              </article>
            ))}
          </section>
        </div>
      )}
      {step === 2 && (
        <>
          <div className="guided-review-summary panel">
            <div>
              <strong>{total.photos}</strong>
              <span>original photos</span>
            </div>
            <div>
              <strong>{total.prints}</strong>
              <span>prints requested</span>
            </div>
            <div>
              <strong>{order.photos.reduce((n, p) => n + p.requests.length, 0)}</strong>
              <span>size / paper choices</span>
            </div>
          </div>
          <div className="guided-checks panel">
            <h2>Before you export</h2>
            <p>
              {total.warnings
                ? `${total.warnings} photos may look soft at a requested size. Edit the print to try a smaller size or replace the photo with a larger original.`
                : 'All photos meet your current resolution target.'}
            </p>
            {crops.length > 0 && (
              <p>
                {crops.length} photos use edge-to-edge cropping. Use Edit on a cart item to check
                its preview, or choose Keep the whole photo.
              </p>
            )}
            {notices.map((notice, i) => (
              <p className="inline-warning" key={i}>
                {notice}
              </p>
            ))}
            <details>
              <summary>Resolution details</summary>
              <label>
                Target quality
                <select
                  aria-label="Guided target DPI"
                  value={order.targetDpi}
                  onChange={(e) => onChange({ targetDpi: Number(e.target.value) })}
                >
                  {[...new Set([150, 200, 300, 600, 1200, order.targetDpi])]
                    .sort((a, b) => a - b)
                    .map((dpi) => (
                      <option key={dpi} value={dpi}>
                        {dpi} DPI{dpi === 300 ? ' · recommended' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <p>
                DPI describes detail at the requested print size. Smaller prints usually retain more
                detail from the same image.
              </p>
            </details>
          </div>
          <OrderCart order={order} units={units} {...cart} friendlyNames />
          <section className="guided-order-details panel">
            <h2>Give the order a name</h2>
            <p>This becomes the ZIP filename. After saving, send the ZIP to the person printing.</p>
            <div className="two-fields">
              <label>
                Order name
                <input
                  aria-label="Order name"
                  maxLength={160}
                  value={order.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                />
              </label>
              <label>
                Prepared for (optional)
                <input
                  aria-label="Prepared for"
                  maxLength={200}
                  value={order.customer}
                  onChange={(e) => onChange({ customer: e.target.value })}
                />
              </label>
            </div>
            <label>
              Instructions for the printer (optional)
              <textarea
                aria-label="Order notes"
                maxLength={5000}
                rows={3}
                value={order.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
                placeholder="Deadlines, paper notes, or other requests"
              />
            </label>
          </section>
        </>
      )}
      <div className="guided-navigation panel">
        <div>
          <strong>
            {total.photos} photos · {total.prints} prints
          </strong>
          <span>Your draft saves on this computer as you work.</span>
        </div>
        {step > 0 && (
          <button className="button secondary" onClick={() => go(step - 1)}>
            <ArrowLeft size={16} /> Back
          </button>
        )}
        {step < 2 ? (
          <button
            className="button primary"
            disabled={!total.photos || busy || !ready || (step === 1 && pendingChoice)}
            onClick={() => go(step + 1)}
          >
            {step === 0 ? 'Next: choose prints' : 'Next: review order'}
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            className="button primary"
            disabled={!total.photos || !order.name.trim() || busy || !ready}
            onClick={onExport}
          >
            <Download size={16} /> Export order ZIP
          </button>
        )}
      </div>
    </div>
  );
}
