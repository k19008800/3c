import { useState } from "react";

interface HelpModalProps {
  title: string;
  children: React.ReactNode;
}

export default function HelpModal({ title, children }: HelpModalProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className="help-icon" onClick={() => setOpen(true)} data-hint={title}>
        ?
      </span>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>💡 {title}</h3>
              <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
