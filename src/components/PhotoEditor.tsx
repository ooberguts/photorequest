import { useEffect, useRef, useState } from 'react';
import { Check, Crop, Expand, Plus, Trash2, X, ArrowUpRight, Info } from 'lucide-react';
import {
  HOLOGRAPHIC,
  SIZES,
  effectiveDpi,
  finishLabel,
  newRequest,
  orientedSize,
  quality,
  requestSchema,
  type Photo,
  type PrintRequest,
} from '../lib/model';

type Props = {
  photo: Photo;
  count: number;
  targetDpi: number;
  units: 'in' | 'mm';
  onClose: () => void;
  onSave: (requests: PrintRequest[]) => void;
  initialRequestId?: string;
  addSize?: boolean;
  maxPrints?: number;
};
export default function PhotoEditor({
  photo,
  count,
  targetDpi,
  units,
  onClose,
  onSave,
  initialRequestId,
  addSize,
  maxPrints = 5000,
}: Props) {
  const [requests, setRequests] = useState(() => {
    const requests = photo.requests.map((r) => ({ ...r }));
    if (addSize) {
      const size =
        SIZES.find(
          (s) => !requests.some((r) => r.widthInches === s.width && r.heightInches === s.height),
        ) || SIZES[0];
      const first = requests[0];
      requests.push({
        ...newRequest(),
        widthInches: size.width,
        heightInches: size.height,
        finish: first.finish,
        holographicStyle: first.holographicStyle,
        fit: first.fit,
      });
    }
    return requests;
  });
  const [active, setActive] = useState(() =>
    addSize
      ? photo.requests.length
      : Math.max(
          0,
          photo.requests.findIndex((r) => r.id === initialRequestId),
        ),
  );
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    if (initialRequestId || addSize) {
      dialog.current
        ?.querySelector<HTMLSelectElement>('.request-panel.active select')
        ?.focus({ preventScroll: true });
    }
  }, []);
  useEffect(() => {
    dialog.current?.querySelector('.request-panel.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const req = requests[Math.min(active, requests.length - 1)];
  const update = (index: number, patch: Partial<PrintRequest>) =>
    setRequests((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const dims = orientedSize(photo, req);
  const dpi = effectiveDpi(photo, req);
  const grade = quality(dpi, targetDpi);
  const factor = units === 'mm' ? 25.4 : 1;
  function save() {
    for (const request of requests) {
      const parsed = requestSchema.safeParse(request);
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
    }
    if (requests.reduce((n, request) => n + request.quantity, 0) * count > maxPrints) {
      setError(
        'These copies exceed the 5,000-print order limit. Reduce the quantities before saving.',
      );
      return;
    }
    onSave(requests);
  }
  return (
    <dialog className="photo-dialog" ref={dialog} onCancel={onClose} aria-labelledby="editor-title">
      <header className="dialog-header">
        <div>
          <span className="eyebrow">IMAGE SETTINGS</span>
          <h2 id="editor-title">
            {count > 1 ? `Edit ${count} selected photos` : 'Print specifications'}
          </h2>
        </div>
        <button className="icon-button" aria-label="Close editor" onClick={onClose}>
          <X size={21} />
        </button>
      </header>
      <div className="editor-body">
        <div className="editor-preview-area">
          <div className="preview-caption">
            <span>PRINT PREVIEW</span>
            <span>{req.fit === 'fill' ? 'Center crop' : 'Entire image'}</span>
          </div>
          <div className="preview-stage">
            <div
              className="photo-print-preview"
              style={{ aspectRatio: `${dims.width} / ${dims.height}` }}
            >
              <img
                src={photo.url}
                alt="Print crop preview"
                style={{ objectFit: req.fit === 'fill' ? 'cover' : 'contain' }}
              />
            </div>
          </div>
          <div className={`dpi-readout ${grade}`}>
            <span className="status-dot" />
            <strong>{Number.isFinite(dpi) ? dpi : '—'} effective DPI</strong>
            <span>
              {grade === 'good'
                ? 'Ready for a detailed print'
                : grade === 'fair'
                  ? 'Below your target resolution'
                  : 'Low resolution at this size'}
            </span>
          </div>
          <div className="source-details">
            <div>
              <span>Original image</span>
              <strong title={photo.originalName}>{photo.originalName}</strong>
            </div>
            <div>
              <span>Pixel dimensions</span>
              <strong>
                {photo.width.toLocaleString()} × {photo.height.toLocaleString()} px
              </strong>
            </div>
            <div>
              <span>Embedded density</span>
              <strong>
                {photo.sourceDpi
                  ? `${Math.round(photo.sourceDpi.x)} × ${Math.round(photo.sourceDpi.y)} DPI`
                  : 'Not specified'}
              </strong>
            </div>
            <div>
              <span>Color profile</span>
              <strong>{photo.colorSpace}</strong>
            </div>
          </div>
          <p className="micro-note">
            <Info size={14} /> Effective DPI uses the actual pixel count and selected print size.
            Photos automatically follow their original orientation.
          </p>
        </div>
        <div className="editor-settings">
          <div className="section-label">
            <h3>Print specifications</h3>
            <span>
              {requests.length} {requests.length === 1 ? 'size' : 'sizes'}
            </span>
          </div>
          {requests.map((r, index) => (
            <section
              key={r.id}
              className={`request-panel ${active === index ? 'active' : ''}`}
              onFocus={() => setActive(index)}
            >
              <div className="request-header">
                <button className="text-button" onClick={() => setActive(index)}>
                  PRINT {String(index + 1).padStart(2, '0')}
                </button>
                <span>{finishLabel(r)}</span>
                {requests.length > 1 && (
                  <button
                    className="icon-button small"
                    aria-label={`Remove print ${index + 1}`}
                    onClick={() => {
                      setRequests((prev) => prev.filter((_, i) => i !== index));
                      setActive(0);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="two-fields">
                <label>
                  Print size
                  <select
                    aria-label={`Print ${index + 1} size`}
                    value={
                      SIZES.find((s) => s.width === r.widthInches && s.height === r.heightInches)
                        ? `${r.widthInches}x${r.heightInches}`
                        : 'custom'
                    }
                    onChange={(e) => {
                      if (e.target.value === 'custom')
                        update(index, { widthInches: 6.5, heightInches: 9 });
                      else {
                        const [w, h] = e.target.value.split('x').map(Number);
                        update(index, { widthInches: w, heightInches: h });
                      }
                    }}
                  >
                    {SIZES.map((s) => (
                      <option key={s.label} value={`${s.width}x${s.height}`}>
                        {units === 'in'
                          ? `${s.label} in`
                          : `${+(s.width * 25.4).toFixed(1)} × ${+(s.height * 25.4).toFixed(1)} mm`}
                      </option>
                    ))}
                    <option value="custom">Custom size</option>
                  </select>
                </label>
                <label>
                  Copies
                  <input
                    aria-label={`Print ${index + 1} copies`}
                    type="number"
                    min="1"
                    max="999"
                    step="1"
                    value={r.quantity}
                    onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className="two-fields dimensions">
                <label>
                  Width ({units})
                  <input
                    aria-label={`Print ${index + 1} width`}
                    type="number"
                    min={0.5 * factor}
                    max={60 * factor}
                    step={units === 'in' ? 0.1 : 1}
                    value={+(r.widthInches * factor).toFixed(3)}
                    onChange={(e) =>
                      update(index, { widthInches: Number(e.target.value) / factor })
                    }
                  />
                </label>
                <span className="dimension-times">×</span>
                <label>
                  Height ({units})
                  <input
                    aria-label={`Print ${index + 1} height`}
                    type="number"
                    min={0.5 * factor}
                    max={60 * factor}
                    step={units === 'in' ? 0.1 : 1}
                    value={+(r.heightInches * factor).toFixed(3)}
                    onChange={(e) =>
                      update(index, { heightInches: Number(e.target.value) / factor })
                    }
                  />
                </label>
              </div>
              <label>Paper finish</label>
              <div className="finish-options">
                {(['matte', 'gloss', 'holographic'] as const).map((f) => (
                  <button
                    key={f}
                    className={r.finish === f ? 'selected' : ''}
                    onClick={() =>
                      update(index, {
                        finish: f,
                        holographicStyle:
                          f === 'holographic' ? r.holographicStyle || 'Rainbow' : '',
                      })
                    }
                  >
                    <span className={`finish-swatch ${f}`} />
                    {f === 'holographic' ? 'Holographic' : f === 'gloss' ? 'Gloss' : 'Matte'}
                    {r.finish === f && <Check size={13} />}
                  </button>
                ))}
              </div>
              {r.finish === 'holographic' && (
                <div className="holo-fields">
                  <label>
                    Holographic pattern
                    <select
                      aria-label={`Print ${index + 1} holographic pattern`}
                      value={
                        HOLOGRAPHIC.slice(0, -1).includes(r.holographicStyle)
                          ? r.holographicStyle
                          : 'Custom'
                      }
                      onChange={(e) =>
                        update(index, {
                          holographicStyle:
                            e.target.value === 'Custom' ? 'Custom pattern' : e.target.value,
                        })
                      }
                    >
                      {HOLOGRAPHIC.map((style) => (
                        <option key={style}>{style}</option>
                      ))}
                    </select>
                  </label>
                  {!HOLOGRAPHIC.slice(0, -1).includes(r.holographicStyle) && (
                    <label>
                      Pattern or stock name
                      <input
                        aria-label="Custom holographic pattern"
                        maxLength={100}
                        value={r.holographicStyle}
                        onChange={(e) => update(index, { holographicStyle: e.target.value })}
                      />
                    </label>
                  )}
                  <p className="micro-note">
                    Specify the physical paper or finishing stock your printer will use.
                  </p>
                </div>
              )}
              <label>Image fitting</label>
              <div className="segmented">
                <button
                  className={r.fit === 'fill' ? 'selected' : ''}
                  onClick={() => update(index, { fit: 'fill' })}
                >
                  <Crop size={15} /> Fill & crop
                </button>
                <button
                  className={r.fit === 'fit' ? 'selected' : ''}
                  onClick={() => update(index, { fit: 'fit' })}
                >
                  <Expand size={15} /> Fit whole image
                </button>
              </div>
              <p className="micro-note">
                {r.fit === 'fill'
                  ? 'Fills the print edge to edge. The preview shows the center crop.'
                  : 'Keeps every part of the photo. White space may appear inside the print.'}
              </p>
            </section>
          ))}
          <button
            className="button secondary add-size"
            onClick={() => {
              setRequests((prev) => [...prev, newRequest()]);
              setActive(requests.length);
            }}
            disabled={requests.length >= 100}
          >
            <Plus size={16} /> Add another print size <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
      <footer className="dialog-footer">
        {error ? (
          <span role="alert" className="inline-error">
            {error}
          </span>
        ) : (
          <span>
            {count > 1
              ? 'These specifications will replace sizes on all selected photos.'
              : 'Sizes and finishes apply to this image.'}
          </span>
        )}
        <div>
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" onClick={save}>
            <Check size={16} /> Save specifications
          </button>
        </div>
      </footer>
    </dialog>
  );
}
