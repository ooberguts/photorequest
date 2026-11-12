import { useEffect, useRef, useState } from 'react';
import { Check, Printer, X } from 'lucide-react';
import { sheetSizeLabel, type PrintGroup, type PrintPage } from '../lib/printing';

type Props = {
  group: PrintGroup;
  pages: PrintPage[];
  paperLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function PrintConfirmation({
  group,
  pages,
  paperLabel,
  onCancel,
  onConfirm,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const request = group.items[0].request;
  return (
    <dialog
      ref={dialog}
      className="paper-confirm-dialog"
      onCancel={onCancel}
      aria-labelledby="paper-confirm-title"
    >
      <header className="dialog-header">
        <div>
          <span className="eyebrow">BEFORE PRINTING</span>
          <h2 id="paper-confirm-title">Check the printer paper</h2>
        </div>
        <button className="icon-button" aria-label="Close paper confirmation" onClick={onCancel}>
          <X size={20} />
        </button>
      </header>
      <div className="paper-confirm-body">
        <p>
          Make sure the paper loaded in the printer matches this batch. Check that the printer is
          requesting the same paper size and media type.
        </p>
        <dl className="required-paper">
          {request.paper && (
            <div>
              <dt>Required paper stock</dt>
              <dd>
                {request.paper.paper.name}
                {request.paper.paper.productCode ? ` · ${request.paper.paper.productCode}` : ''}
              </dd>
            </div>
          )}
          <div>
            <dt>Required paper finish</dt>
            <dd>
              {request.finish === 'holographic'
                ? 'Holographic'
                : request.finish === 'gloss'
                  ? 'Gloss'
                  : 'Matte'}
            </dd>
          </div>
          {request.finish === 'holographic' && (
            <div>
              <dt>Holographic pattern / stock</dt>
              <dd>{request.holographicStyle}</dd>
            </div>
          )}
          <div>
            <dt>Sheet size</dt>
            <dd>
              {paperLabel} · {sheetSizeLabel(pages[0])}
            </dd>
          </div>
          <div>
            <dt>Page orientation</dt>
            <dd>{pages[0].width > pages[0].height ? 'Landscape' : 'Portrait'}</dd>
          </div>
          <div>
            <dt>This print job</dt>
            <dd>
              {pages.length} {pages.length === 1 ? 'sheet' : 'sheets'} · {group.items.length}{' '}
              {group.items.length === 1 ? 'print' : 'prints'}
            </dd>
          </div>
        </dl>
        <div className="paper-printer-reminder">
          <Printer size={19} />
          <p>
            In the PDF print dialog, select the matching paper size and media type. Use{' '}
            <strong>Actual size / 100%</strong>, one page per sheet, one copy, and single-sided
            printing.
          </p>
        </div>
        <label className="paper-confirm-check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I have checked the loaded paper and will use the matching printer paper settings.
        </label>
      </div>
      <footer className="dialog-footer">
        <button className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={!checked} onClick={onConfirm}>
          <Check size={16} /> Confirm paper and open PDF
        </button>
      </footer>
    </dialog>
  );
}
