import { useEffect, useState } from 'react';
import { Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { sheetCost } from '../lib/papers';
import {
  effectiveDpi,
  finishLabel,
  photoName,
  quality,
  sizeLabel,
  stats,
  type Order,
} from '../lib/model';

type Props = {
  order: Order;
  units: 'in' | 'mm';
  friendlyNames?: boolean;
  onEdit: (photoId: string, requestId: string) => void;
  onAddSize: (photoId: string) => void;
  onQuantity: (photoId: string, requestId: string, quantity: number) => boolean;
  onRemove: (photoId: string, requestId: string) => void;
  onRemovePhoto: (photoId: string) => void;
};

function CartQuantity({
  quantity,
  label,
  onCommit,
}: {
  quantity: number;
  label: string;
  onCommit: (value: number) => boolean;
}) {
  const [value, setValue] = useState(String(quantity));
  const [error, setError] = useState('');
  useEffect(() => {
    setValue(String(quantity));
    setError('');
  }, [quantity]);
  function commit() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1 || next > 999) {
      setValue(String(quantity));
      setError('Use 1–999.');
      return;
    }
    if (next !== quantity && !onCommit(next)) {
      setValue(String(quantity));
      setError('Not changed.');
      return;
    }
    setValue(String(next));
    setError('');
  }
  return (
    <div className="cart-quantity">
      <input
        aria-label={label}
        type="number"
        min={1}
        max={999}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

export default function OrderCart({
  order,
  units,
  friendlyNames = false,
  onEdit,
  onAddSize,
  onQuantity,
  onRemove,
  onRemovePhoto,
}: Props) {
  if (!order.photos.length) return null;
  const items = order.photos.reduce((n, p) => n + p.requests.length, 0);
  const total = stats(order);
  return (
    <section id="order-cart" className="order-cart panel" aria-label="Order cart">
      <div className="cart-heading">
        <div>
          <ShoppingCart size={20} />
          <h2>
            Order cart{' '}
            <span>
              {items} {items === 1 ? 'item' : 'items'}
            </span>
          </h2>
        </div>
        <p>Each size and paper finish is a separate item. Add several sizes of the same image.</p>
      </div>
      {order.photos.map((photo, index) => (
        <div className="cart-photo-group" key={photo.id} data-photo-id={photo.id}>
          <div className="cart-photo-heading">
            <img src={photo.url} alt="" />
            <div>
              <strong title={photo.originalName}>
                {friendlyNames ? photo.originalName : photoName(index)}
              </strong>
              <span title={photo.originalName}>
                {friendlyNames ? photoName(index) : photo.originalName}
              </span>
            </div>
            <span className="cart-photo-count">
              {photo.requests.length}{' '}
              {photo.requests.length === 1 ? 'size / finish' : 'sizes / finishes'}
            </span>
            <button
              className="button secondary compact"
              aria-label={`Add size for ${photoName(index)}`}
              disabled={photo.requests.length >= 100}
              onClick={() => onAddSize(photo.id)}
            >
              <Plus size={14} /> Add size
            </button>
            <button
              className="icon-button small"
              aria-label={`Remove ${photoName(index)} from cart`}
              onClick={() => onRemovePhoto(photo.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="cart-table-scroll">
            <table className="cart-table">
              <thead>
                <tr>
                  <th>Print size</th>
                  <th>Paper finish</th>
                  <th>Copies</th>
                  <th className="cart-dpi">Resolution</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {photo.requests.map((request, requestIndex) => {
                  const dpi = effectiveDpi(photo, request),
                    label = `${photoName(index)} item ${requestIndex + 1}`;
                  return (
                    <tr key={request.id} aria-label={label}>
                      <td>
                        <strong>{sizeLabel(request, units)}</strong>
                        <span className="cart-fitting">
                          {request.fit === 'fill' ? 'Center crop' : 'Fit whole image'}
                        </span>
                      </td>
                      <td>
                        <span className={`finish-dot ${request.finish}`} /> {finishLabel(request)}
                        {request.paper && (
                          <span className="cart-paper-stock">
                            {request.paper.paper.name}
                            <small>{sheetCost(request.paper.paper, request.paper.currency)}</small>
                          </span>
                        )}
                      </td>
                      <td>
                        <CartQuantity
                          quantity={request.quantity}
                          label={`Copies for ${label}`}
                          onCommit={(value) => onQuantity(photo.id, request.id, value)}
                        />
                      </td>
                      <td
                        className={`cart-dpi ${quality(dpi, order.targetDpi) === 'good' ? 'green' : 'amber'}`}
                      >
                        {dpi} DPI
                      </td>
                      <td>
                        <div className="cart-row-actions">
                          <button
                            className={friendlyNames ? 'text-button' : 'icon-button small'}
                            aria-label={`Edit ${label}`}
                            title="Edit this print size"
                            onClick={() => onEdit(photo.id, request.id)}
                          >
                            <Pencil size={14} />
                            {friendlyNames && 'Edit'}
                          </button>
                          <button
                            className="icon-button small"
                            aria-label={`Remove ${label}`}
                            onClick={() => onRemove(photo.id, request.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="cart-totals">
        <span>
          {total.photos} {total.photos === 1 ? 'original image' : 'original images'} · {items}{' '}
          {items === 1 ? 'cart item' : 'cart items'}
        </span>
        <strong>{total.prints} total prints</strong>
      </div>
    </section>
  );
}
