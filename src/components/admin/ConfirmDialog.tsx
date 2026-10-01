import type { ReactNode } from "react";
import Modal from "../Modal";
import Button from "../Button";

interface Props {
  title: string;
  confirmLabel: string;
  loading?: boolean;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}

export default function ConfirmDialog({ title, confirmLabel, loading, confirmDisabled, onCancel, onConfirm, children }: Props) {
  return (
    <Modal title={title} onClose={loading ? () => {} : onCancel} size="sm">
      <p className="confirm-text">{children}</p>
      <div className="modal-actions">
        <Button variant="secondary" size="md" onClick={onCancel} disabled={loading}>
          Abbrechen
        </Button>
        <Button variant="danger" size="md" onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
