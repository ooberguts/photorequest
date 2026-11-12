import type { PrintRequest } from '../lib/model';
import {
  fitsPaper,
  selectPaper,
  sheetCost,
  paperNotice,
  type PaperCatalog,
  type PaperSelection,
} from '../lib/papers';
import { sizeLabel } from '../lib/model';

export function PaperFacts({ selection }: { selection: PaperSelection }) {
  const paper = selection.paper;
  return (
    <div className="paper-facts">
      <strong>{paper.name}</strong>
      <p>{paper.description || paper.recommendedUse || 'Paper supplied by the printer.'}</p>
      <dl>
        <div>
          <dt>Sheet size</dt>
          <dd>{sizeLabel(paper)}</dd>
        </div>
        <div>
          <dt>Paper cost</dt>
          <dd>{sheetCost(paper, selection.currency)}</dd>
        </div>
        {paper.weightGsm && (
          <div>
            <dt>Weight</dt>
            <dd>{paper.weightGsm} gsm</dd>
          </div>
        )}
        {paper.thicknessMicrons && (
          <div>
            <dt>Thickness</dt>
            <dd>{paper.thicknessMicrons} µm</dd>
          </div>
        )}
        <div>
          <dt>Printable sides</dt>
          <dd>{paper.doubleSided ? 'Both sides' : 'One side'}</dd>
        </div>
        <div>
          <dt>Borderless</dt>
          <dd>
            {paper.borderless ? 'Supported on compatible printers' : 'Ask printer about margins'}
          </dd>
        </div>
        {paper.brand && (
          <div>
            <dt>Brand / product</dt>
            <dd>
              {paper.brand} {paper.productCode}
            </dd>
          </div>
        )}
      </dl>
      {paper.printerCompatibility && <p>Printer compatibility: {paper.printerCompatibility}</p>}
      {paper.recommendedUse && <p>Suggested use: {paper.recommendedUse}</p>}
      {paper.notes && <p>{paper.notes}</p>}
      <small>
        Sheet cost is the paper cost, not a quote for your prints. The printer confirms the final
        price.
      </small>
    </div>
  );
}

export default function PaperPicker({
  request,
  catalog,
  onChange,
  label = 'Printer paper',
}: {
  request: PrintRequest;
  catalog: PaperCatalog | null;
  onChange: (patch: Partial<PrintRequest>) => void;
  label?: string;
}) {
  const papers = catalog?.papers.filter((p) => p.available) || [];
  const current = request.paper;
  const known =
    current?.catalogId === catalog?.id && papers.some((p) => p.id === current?.paper.id);
  const notice = current ? paperNotice(current, catalog) : '';
  return (
    <div className="paper-picker">
      {(papers.length > 0 || current) && (
        <label>
          {label}
          <select
            aria-label={label}
            value={current ? (known ? current.paper.id : '__saved') : ''}
            onChange={(e) => {
              const paper = papers.find((p) => p.id === e.target.value);
              onChange(
                paper && catalog
                  ? {
                      paper: selectPaper(catalog, paper),
                      finish: paper.finish,
                      holographicStyle: paper.holographicStyle,
                    }
                  : { paper: undefined },
              );
            }}
          >
            <option value="">Choose a finish without a specific paper</option>
            {current && !known && (
              <option value="__saved">Saved choice: {current.paper.name}</option>
            )}
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {sizeLabel(p)} · {sheetCost(p, catalog!.currency)}
                {fitsPaper(request, p) ? '' : ' · too small'}
              </option>
            ))}
          </select>
        </label>
      )}
      {!papers.length && (
        <p className="micro-note">
          Load a paper list from your printer to see their available papers and sheet costs. You can
          also choose a finish below.
        </p>
      )}
      {current && (
        <>
          <PaperFacts selection={current} />
          {!fitsPaper(request, current.paper) && (
            <p role="alert" className="inline-error">
              This print is larger than the chosen sheet. Choose a smaller print or a larger paper.
            </p>
          )}
          {notice && (
            <p className="inline-warning">
              {notice}
              {known && catalog && (
                <button
                  className="text-button"
                  onClick={() => {
                    const paper = papers.find((p) => p.id === current.paper.id)!;
                    onChange({
                      paper: selectPaper(catalog, paper),
                      finish: paper.finish,
                      holographicStyle: paper.holographicStyle,
                    });
                  }}
                >
                  Use latest paper details
                </button>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
