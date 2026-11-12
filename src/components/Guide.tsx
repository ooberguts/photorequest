import { openInstallationHelp } from './StartupSupport';
import {
  ArrowDownToLine,
  ArrowRight,
  Archive,
  Camera,
  Check,
  FileJson,
  FolderOpen,
  Layers,
  Printer,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
export default function Guide() {
  return (
    <div className="guide-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INSTRUCTIONS</span>
          <h1>How it works</h1>
          <p>Create, export, import, and print photo orders.</p>
        </div>
        <div className="heading-badge">
          <ShieldCheck size={17} /> Works offline
        </div>
      </div>
      <div className="guide-hero">
        <div className="guide-hero-copy">
          <span className="eyebrow">ORDER WORKFLOW</span>
          <h2>Create, share, and print</h2>
          <p>
            Configure images in Order studio, export a ZIP, and open it on the printing computer.
          </p>
        </div>
        <div className="guide-flow">
          <div>
            <Camera />
            <span>Your photos</span>
          </div>
          <ArrowRight size={18} />
          <div>
            <Archive />
            <span>One order ZIP</span>
          </div>
          <ArrowRight size={18} />
          <div>
            <Printer />
            <span>PDF print sheets</span>
          </div>
        </div>
      </div>
      <div className="guide-cards">
        <article className="panel">
          <span className="guide-step">01 / REQUEST</span>
          <Layers size={25} />
          <h3>Create an order</h3>
          <p>
            Add JPEG, PNG, or WebP photos. Give each one a size, quantity, and paper finish. Add
            several sizes to the same photo, or select several photos to apply the same settings.
            Follow Add photos, Choose prints, and Review & export. Use All tools for the complete
            workspace. Load your printer’s paper list to see available stocks and sheet costs.
          </p>
          <p>
            Choose inches or millimeters for custom sizes. “Fill & crop” shows a center crop; “Fit
            whole image” preserves the whole image with white space as needed.
          </p>
        </article>
        <article className="panel">
          <span className="guide-step">02 / SHARE</span>
          <Archive size={25} />
          <h3>Export and open a ZIP</h3>
          <p>
            Name the order, add any notes, and export a ZIP. Images are renamed photo00001,
            photo00002, and so on. Your originals on disk keep their existing names.
          </p>
          <p>
            Send the ZIP however you like. The recipient opens it in the same app. Their images,
            specifications, and notes all come back together.
          </p>
        </article>
        <article className="panel">
          <span className="guide-step">03 / PRINT</span>
          <Printer size={25} />
          <h3>Prepare print sheets</h3>
          <p>
            Open Print desk and choose a standard or custom sheet size. Auto arrange packs mixed
            print sizes into available spaces and can rotate frames without resizing them. Review
            the sheet preview, printable-area usage, and sheet count.
          </p>
          <p>
            Before opening a print job, confirm that the loaded paper matches the displayed finish,
            pattern, and sheet size. Select matching paper size and media type in the print dialog.
            Use Actual size / 100%, one page per sheet, single-sided, and one copy. Mark each batch
            printed when done.
          </p>
        </article>
      </div>
      <div className="guide-details">
        <section className="panel package-example">
          <div className="panel-heading">
            <FolderOpen size={19} />
            <h3>What’s inside the ZIP?</h3>
          </div>
          <pre>
            {
              'Summer memories.zip\n├── order.json\n├── README.txt\n└── images/\n    ├── photo00001.jpg\n    ├── photo00002.png\n    └── photo00003.webp'
            }
          </pre>
          <p>
            The versioned JSON maps each file to its original name, pixel dimensions, embedded DPI
            when available, SHA-256 checksum, requested sizes, copies, fitting, and finishes.
          </p>
          <span className="inline-tag">
            <FileJson size={14} /> An open, documented order format
          </span>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <ScanLine size={19} />
            <h3>What does DPI actually tell me?</h3>
          </div>
          <p>
            Effective image resolution is the number of image pixels available per inch of the
            requested print. This is often called DPI; technically it is PPI. Printer dot resolution
            is a separate driver setting.
          </p>
          <div className="dpi-example">
            <strong>1800 × 1200 px</strong>
            <span>printed at 6 × 4 inches</span>
            <ArrowRight size={20} />
            <strong>300 DPI</strong>
          </div>
          <p>
            The default target is 300 DPI. Below that target, the app flags a photo for review.
            Below 150 DPI, it shows a stronger warning. Changing an image’s embedded DPI tag cannot
            create missing detail.
          </p>
          <p>
            For cropped prints, the check accounts for pixels removed by the crop. For whole-image
            prints, it uses the image’s actual size inside the requested frame.
          </p>
        </section>
      </div>
      <div className="guide-footnotes">
        <div>
          <Sparkles size={20} />
          <div>
            <strong>Paper finishes</strong>
            <p>
              Gloss, matte, and holographic describe real paper or finishing materials. Holographic
              supports Rainbow, Broken glass, Sparkle, Stars, Hearts, and custom patterns. Confirm
              the stock with the person printing.
            </p>
          </div>
        </div>
        <div>
          <ShieldCheck size={20} />
          <div>
            <strong>Local storage and color profiles</strong>
            <p>
              No account or upload is required. The active draft is saved locally, including the
              images. Export a ZIP as your portable backup. Original files keep embedded metadata,
              which can include location. PDF output is rendered through the system browser’s color
              pipeline; use the originals for a professionally color-managed workflow.
            </p>
          </div>
        </div>
        <div>
          <ArrowDownToLine size={20} />
          <div>
            <strong>Practical limits.</strong>
            <p>
              Up to 500 images, 100 MB per image, 80 megapixels per image, 512 MB of originals per
              order, and 5,000 total prints. HEIC, TIFF, RAW, and GIF need conversion before
              importing. Physical printer margins and borderless expansion can affect final
              dimensions; measure a test print.
            </p>
          </div>
        </div>
      </div>
      <div className="workflow-strip">
        <button className="text-button" onClick={() => void openInstallationHelp()}>
          Installation & troubleshooting
        </button>
        <span>
          <Check size={15} /> macOS + Windows
        </span>
        <span>
          <Check size={15} /> No cloud required
        </span>
        <span>
          <Check size={15} /> One app for both sides
        </span>
      </div>
    </div>
  );
}
