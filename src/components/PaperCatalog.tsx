import { useState } from 'react';
import { Download, Plus, Save, Trash2, Upload } from 'lucide-react';
import {
  newCatalog,
  catalogIssue,
  newPaper,
  paperCatalogSchema,
  serializeCatalog,
  type PaperCatalog as Catalog,
  type Paper,
} from '../lib/papers';
import { safeName, sizeLabel } from '../lib/model';
import { saveFile } from '../lib/files';

export default function PaperCatalog({
  value,
  onSave,
  onImport,
}: {
  value: Catalog | null;
  onSave: (catalog: Catalog) => boolean;
  onImport: () => void;
}) {
  const [draft, setDraft] = useState<Catalog>(() => structuredClone(value || newCatalog()));
  const [activeId, setActiveId] = useState(draft.papers[0]?.id || '');
  const [units, setUnits] = useState<'in' | 'mm'>('in');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(!value);
  const active = draft.papers.find((p) => p.id === activeId);
  function change(patch: Partial<Catalog>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setMessage('');
  }
  function update(patch: Partial<Paper>) {
    change({ papers: draft.papers.map((p) => (p.id === activeId ? { ...p, ...patch } : p)) });
  }
  function validated() {
    const result = paperCatalogSchema.safeParse({ ...draft, updatedAt: new Date().toISOString() });
    if (!result.success) {
      const issue = result.error.issues[0];
      const index =
        issue.path[0] === 'papers' && typeof issue.path[1] === 'number' ? issue.path[1] : null;
      if (index !== null) setActiveId(draft.papers[index].id);
      setError(catalogIssue(issue));
      return null;
    }
    setError('');
    return result.data;
  }
  function save() {
    const catalog = validated();
    if (catalog && onSave(catalog)) {
      setDraft(catalog);
      setDirty(false);
      setMessage('Paper list saved on this computer. Export it to share with customers.');
    }
  }
  async function exportList() {
    const catalog = validated();
    if (!catalog) return;
    try {
      if (
        await saveFile(
          new TextEncoder().encode(serializeCatalog(catalog)),
          `${safeName(catalog.name)}.json`,
          'json',
        )
      )
        setMessage(
          'Paper list exported. Send this JSON file to customers so they can load your paper choices.',
        );
    } catch {
      setError('The paper list could not be exported. Try again.');
    }
  }
  const scale = units === 'mm' ? 25.4 : 1;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRINTER PAPER LIST</span>
          <h1>Paper catalog</h1>
          <p>List the paper you offer, then export a file for customers to load.</p>
        </div>
        <button className="button secondary" onClick={onImport}>
          <Upload size={16} /> Import paper list
        </button>
      </div>
      <div className="catalog-intro panel">
        <strong>One list for the printer and the customer</strong>
        <p>
          Set up your available paper here. Customers load the exported JSON in Choose prints and
          see your sheet sizes, finishes, costs, and notes. Existing orders keep a copy of the paper
          they selected.
        </p>
      </div>
      <div className="catalog-metadata panel">
        <label>
          Paper list name
          <input
            aria-label="Paper list name"
            maxLength={160}
            value={draft.name}
            onChange={(e) => change({ name: e.target.value })}
          />
        </label>
        <label>
          Printer / business name
          <input
            aria-label="Printer name"
            maxLength={160}
            value={draft.printerName}
            onChange={(e) => change({ printerName: e.target.value })}
          />
        </label>
        <label>
          Currency
          <input
            aria-label="Paper currency"
            maxLength={3}
            value={draft.currency}
            onChange={(e) => change({ currency: e.target.value.toUpperCase() })}
          />
        </label>
      </div>
      <div className="catalog-layout">
        <aside className="catalog-list panel">
          <h2>
            Paper types <span>{draft.papers.length}</span>
          </h2>
          <p>One entry per stock and sheet size.</p>
          {draft.papers.map((p) => (
            <button
              key={p.id}
              className={p.id === activeId ? 'active' : ''}
              onClick={() => setActiveId(p.id)}
            >
              <strong>{p.name || 'Unnamed paper'}</strong>
              <span>
                {sizeLabel(p)} · {p.available ? 'Available' : 'Unavailable'}
              </span>
            </button>
          ))}
          <button
            className="button secondary"
            disabled={draft.papers.length >= 250}
            onClick={() => {
              const paper = newPaper();
              change({ papers: [...draft.papers, paper] });
              setActiveId(paper.id);
            }}
          >
            <Plus size={15} /> Add paper type
          </button>
        </aside>
        <section className="catalog-editor panel" aria-label="Paper details">
          {!active ? (
            <div className="catalog-empty">
              <h2>Add your first paper</h2>
              <p>
                Use Add paper type, enter its sheet size and cost, then save your list. No prices
                are assumed for you.
              </p>
            </div>
          ) : (
            <>
              <div className="catalog-editor-heading">
                <h2>Paper details</h2>
                <button
                  className="button secondary compact"
                  onClick={() => {
                    const papers = draft.papers.filter((p) => p.id !== active.id);
                    change({ papers });
                    setActiveId(papers[0]?.id || '');
                  }}
                >
                  <Trash2 size={14} /> Remove paper type
                </button>
              </div>
              <label>
                Paper name
                <input
                  aria-label="Paper name"
                  maxLength={160}
                  value={active.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <div className="two-fields">
                <label>
                  Finish
                  <select
                    aria-label="Paper finish"
                    value={active.finish}
                    onChange={(e) =>
                      update({
                        finish: e.target.value as Paper['finish'],
                        holographicStyle:
                          e.target.value === 'holographic'
                            ? active.holographicStyle || 'Rainbow'
                            : '',
                      })
                    }
                  >
                    <option value="matte">Matte</option>
                    <option value="gloss">Gloss</option>
                    <option value="holographic">Holographic</option>
                  </select>
                </label>
                <label>
                  Sheet cost ({draft.currency})
                  <input
                    aria-label="Cost per sheet"
                    type="number"
                    min={0}
                    max={100000}
                    step="0.001"
                    placeholder="Unknown / not provided"
                    value={active.costPerSheet ?? ''}
                    onChange={(e) =>
                      update({
                        costPerSheet: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              {active.finish === 'holographic' && (
                <label>
                  Holographic pattern
                  <input
                    aria-label="Paper holographic pattern"
                    maxLength={100}
                    value={active.holographicStyle}
                    onChange={(e) => update({ holographicStyle: e.target.value })}
                  />
                </label>
              )}
              <div className="catalog-size-label">
                <strong>Physical sheet size</strong>
                <label>
                  Units
                  <select
                    aria-label="Paper size units"
                    value={units}
                    onChange={(e) => setUnits(e.target.value as 'in' | 'mm')}
                  >
                    <option value="in">Inches</option>
                    <option value="mm">Millimeters</option>
                  </select>
                </label>
              </div>
              <div className="two-fields">
                <label>
                  Sheet width ({units})
                  <input
                    aria-label="Paper sheet width"
                    type="number"
                    min={scale}
                    max={60 * scale}
                    step="any"
                    value={+(active.widthInches * scale).toFixed(3)}
                    onChange={(e) => update({ widthInches: Number(e.target.value) / scale })}
                  />
                </label>
                <label>
                  Sheet height ({units})
                  <input
                    aria-label="Paper sheet height"
                    type="number"
                    min={scale}
                    max={60 * scale}
                    step="any"
                    value={+(active.heightInches * scale).toFixed(3)}
                    onChange={(e) => update({ heightInches: Number(e.target.value) / scale })}
                  />
                </label>
              </div>
              <label>
                Description for customers
                <textarea
                  aria-label="Paper description"
                  maxLength={1000}
                  rows={2}
                  placeholder="Describe how the surface looks and feels."
                  value={active.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
              </label>
              <label className="catalog-check">
                <input
                  type="checkbox"
                  checked={active.available}
                  onChange={(e) => update({ available: e.target.checked })}
                />{' '}
                Available for new orders
              </label>
              <details className="catalog-extra">
                <summary>More paper facts (optional)</summary>
                <div>
                  <div className="two-fields">
                    <label>
                      Brand
                      <input
                        aria-label="Paper brand"
                        maxLength={160}
                        value={active.brand}
                        onChange={(e) => update({ brand: e.target.value })}
                      />
                    </label>
                    <label>
                      Product / stock code
                      <input
                        aria-label="Paper product code"
                        maxLength={160}
                        value={active.productCode}
                        onChange={(e) => update({ productCode: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="two-fields">
                    <label>
                      Weight (gsm)
                      <input
                        aria-label="Paper weight"
                        type="number"
                        min={1}
                        max={2000}
                        value={active.weightGsm ?? ''}
                        onChange={(e) =>
                          update({
                            weightGsm: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Thickness (µm)
                      <input
                        aria-label="Paper thickness"
                        type="number"
                        min={1}
                        max={5000}
                        value={active.thicknessMicrons ?? ''}
                        onChange={(e) =>
                          update({
                            thicknessMicrons: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Suggested use
                    <input
                      aria-label="Paper suggested use"
                      maxLength={500}
                      value={active.recommendedUse}
                      onChange={(e) => update({ recommendedUse: e.target.value })}
                    />
                  </label>
                  <label>
                    Compatible printers / inks
                    <input
                      aria-label="Paper compatibility"
                      maxLength={500}
                      value={active.printerCompatibility}
                      onChange={(e) => update({ printerCompatibility: e.target.value })}
                    />
                  </label>
                  <label className="catalog-check">
                    <input
                      type="checkbox"
                      checked={active.doubleSided}
                      onChange={(e) => update({ doubleSided: e.target.checked })}
                    />{' '}
                    Printable on both sides
                  </label>
                  <label className="catalog-check">
                    <input
                      type="checkbox"
                      checked={active.borderless}
                      onChange={(e) => update({ borderless: e.target.checked })}
                    />{' '}
                    Supports borderless printing on compatible printers
                  </label>
                  <label>
                    Handling / other notes
                    <textarea
                      aria-label="Paper notes"
                      maxLength={1000}
                      rows={2}
                      value={active.notes}
                      onChange={(e) => update({ notes: e.target.value })}
                    />
                  </label>
                </div>
              </details>
            </>
          )}
        </section>
      </div>
      <div className="catalog-actions panel">
        <span role="status">
          {message ||
            (dirty ? 'Unsaved changes. Save to use this list in the app.' : 'Saved paper list.')}
        </span>
        <button className="button secondary" onClick={() => void exportList()}>
          <Download size={16} /> Export paper list JSON
        </button>
        <button className="button primary" onClick={save}>
          <Save size={16} /> Save paper list
        </button>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </>
  );
}
