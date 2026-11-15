import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { cx } from './cx';
import styles from './Modal.module.css';

interface Props {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  /** Hide the title visually (it is still announced to screen readers). */
  hideTitle?: boolean;
  wide?: boolean;
  className?: string;
}

/** An accessible modal dialog built on the native <dialog> element (focus trap and Escape included). */
export function Modal({ title, onClose, children, hideTitle, wide, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    return () => {
      if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, wide && styles.wide, className)}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose?.();
      }}
    >
      <div className={styles.body}>
        <header className={cx(styles.head, hideTitle && 'sr-only')}>
          <h2>{title}</h2>
        </header>
        {onClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
}
